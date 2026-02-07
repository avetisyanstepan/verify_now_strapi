const SMS_URL = "https://activate-api.smsverified.com/stubs/handler_api.php";

function minutesAgoDate(mins) {
  return new Date(Date.now() - mins * 60 * 1000);
}

async function smsFetch(apiKey, params) {
  const url = new URL(SMS_URL);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  return (await res.text()).trim();
}

module.exports = {
  autoCancelActivations: {
    task: async ({ strapi }) => {
      strapi.log.info("[CRON] tick " + new Date().toISOString());

      const SMS_KEY = process.env.SMSVERIFIED_API_KEY;
      if (!SMS_KEY) {
        strapi.log.warn("[CRON] SMSVERIFIED_API_KEY missing");
        return;
      }

      const cutoff = minutesAgoDate(10); // верни 10 после теста (или оставь 10)
      const activations = await strapi.db
        .query("api::activation.activation")
        .findMany({
          where: {
            statuss: "created",
            refunded: false,
            createdAt: { $lt: cutoff },
            $or: [{ code: null }, { code: "" }],
          },
          populate: { user: true },
          limit: 200,
          orderBy: { createdAt: "asc" },
        });

      if (!activations.length) return;

      strapi.log.info(`[CRON] Found ${activations.length} expired activations`);

      for (const a of activations) {
        const activationId = a.id;
        const providerAccessId = a.providerAccessId;
        const userId = a.user?.id;

        if (!activationId || !providerAccessId || !userId) continue;

        // 1) cancel у провайдера (можно оставить до транзакции)
        let providerRaw = "";
        try {
          providerRaw = await smsFetch(SMS_KEY, {
            action: "setStatus",
            id: String(providerAccessId),
            status: "8",
          });
        } catch (err) {
          providerRaw = "PROVIDER_CANCEL_FAILED";
        }

        try {
          await strapi.db.transaction(async (trx) => {
            const actQ = strapi.db.query("api::activation.activation");
            const userQ = strapi.db.query("plugin::users-permissions.user");

            // 2) читаем свежую запись
            const fresh = await actQ.findOne({
              where: { id: activationId },
              populate: { user: true },
              transacting: trx,
            });

            if (!fresh) return;

            // если уже refunded — выходим (защита)
            if (fresh.refunded) return;

            // если SMS пришла — не возвращаем
            const code = String(fresh.code || "").trim();
            if (code) {
              // но статус всё равно можно поставить canceled
              await actQ.update({
                where: { id: activationId },
                data: { statuss: "canceled", rawLastStatus: providerRaw },
                transacting: trx,
              });
              return;
            }

            const priceUsd = Number(fresh.priceUsd || 0);
            if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
              // нечего возвращать — просто canceled
              await actQ.update({
                where: { id: activationId },
                data: { statuss: "canceled", rawLastStatus: providerRaw },
                transacting: trx,
              });
              return;
            }

            // 3) "лок" — атомарно помечаем activation как refunded=true (пока мы в транзакции)
            await actQ.update({
              where: { id: activationId },
              data: {
                statuss: "canceled",
                refunded: true,
                rawLastStatus: providerRaw,
              },
              transacting: trx,
            });

            // 4) делаем refund пользователю
            const u = await userQ.findOne({
              where: { id: userId },
              transacting: trx,
            });
            if (!u) return;

            const cur = Number(u.balanceUsd || 0);
            const next = +(cur + priceUsd).toFixed(6);

            await userQ.update({
              where: { id: userId },
              data: { balanceUsd: next },
              transacting: trx,
            });

            strapi.log.info(
              `[CRON] refunded activation=${activationId} user=${userId} +${priceUsd} => ${next}`
            );
          });
        } catch (err) {
          strapi.log.error("[CRON ERROR]", err);
        }
      }
    },

    options: {
      rule: "*/1 * * * *", // раз в минуту (надёжно)
    },
  },
};
