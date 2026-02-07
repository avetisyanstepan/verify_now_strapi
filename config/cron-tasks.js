const SMS_URL = "https://activate-api.smsverified.com/stubs/handler_api.php";

function minutesAgoDate(mins) {
  return new Date(Date.now() - mins * 60 * 1000);
}

async function smsFetch(apiKey, params) {
  const url = new URL(SMS_URL);
  url.searchParams.set("api_key", apiKey);

  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString());
  return (await res.text()).trim();
}

module.exports = {
  autoCancelActivations: {
    task: async ({ strapi }) => {
      const SMS_KEY = process.env.SMSVERIFIED_API_KEY;

      if (!SMS_KEY) {
        strapi.log.warn("[CRON] SMSVERIFIED_API_KEY missing");
        return;
      }

      const cutoff = minutesAgoDate(10);

      // 🔎 ищем старые created без code
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
          limit: 100,
        });

      if (!activations.length) return;

      strapi.log.info(`[CRON] Found ${activations.length} expired activations`);

      for (const a of activations) {
        try {
          const providerAccessId = a.providerAccessId;
          const priceUsd = Number(a.priceUsd || 0);
          const userId = a.user?.id;

          if (!providerAccessId || !userId) continue;

          // 1️⃣ cancel у провайдера
          let providerRaw = "";
          try {
            providerRaw = await smsFetch(SMS_KEY, {
              action: "setStatus",
              id: providerAccessId,
              status: "8",
            });
          } catch (err) {
            providerRaw = "PROVIDER_CANCEL_FAILED";
          }

          // 2️⃣ транзакция refund + update activation
          await strapi.db.transaction(async (trx) => {
            const actQuery = strapi.db.query("api::activation.activation");
            const userQuery = strapi.db.query(
              "plugin::users-permissions.user"
            );

            const fresh = await actQuery.findOne({
              where: { id: a.id },
              populate: { user: true },
              transacting: trx,
            });

            if (!fresh || fresh.refunded) return;

            // 💰 refund
            if (priceUsd > 0) {
              const user = await userQuery.findOne({
                where: { id: userId },
                transacting: trx,
              });

              const current = Number(user.balanceUsd || 0);
              const next = +(current + priceUsd).toFixed(6);

              await userQuery.update({
                where: { id: userId },
                data: { balanceUsd: next },
                transacting: trx,
              });
            }

            // 🔄 update activation
            await actQuery.update({
              where: { id: a.id },
              data: {
                statuss: "canceled",
                refunded: true,
                rawLastStatus: providerRaw,
              },
              transacting: trx,
            });
          });
        } catch (err) {
          strapi.log.error("[CRON ERROR]", err);
        }
      }
    },

    options: {
      // ⏱ каждые 60 секунд
      rule: "0 * * * * *",
    },
  },
};
