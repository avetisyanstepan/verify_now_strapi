const SMS_URL = "https://activate-api.smsverified.com/stubs/handler_api.php";

function minutesAgoDate(mins) {
  return new Date(Date.now() - mins * 60 * 1000);
}

async function smsFetch(apiKey, params) {
  const url = new URL(SMS_URL);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
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

      const cutoff = minutesAgoDate(10);

      // 1) Берём entries (в Strapi 5 может быть 2 entries на 1 document)
      const entries = await strapi.db
        .query("api::activation.activation")
        .findMany({
          where: {
            statuss: "created",          // ✅ ТОЛЬКО created
            refunded: false,
            createdAt: { $lt: cutoff },
            $or: [{ code: null }, { code: "" }],
          },
          populate: { user: true },
          limit: 500,
          orderBy: { createdAt: "asc" },
        });

      if (!entries.length) return;

      // 2) ✅ дедуп по documentId (иначе будет 1=>2 из-за draft/publish)
      const byDoc = {};
      for (const a of entries) {
        const key = a.documentId ? String(a.documentId) : "id_" + String(a.id);
        if (!byDoc[key]) byDoc[key] = a;
      }
      const docs = Object.values(byDoc);

      strapi.log.info(
        `[CRON] candidates entries=${entries.length} docs=${docs.length}`
      );

      // 3) обрабатываем каждый document один раз
      for (const a of docs) {
        const documentId = a.documentId;
        const providerAccessId = a.providerAccessId;

        if (!documentId || !providerAccessId) continue;

        // 3.1) cancel у провайдера
        let providerRaw = "";
        try {
          providerRaw = await smsFetch(SMS_KEY, {
            action: "setStatus",
            id: providerAccessId,
            status: "8",
          });
        } catch (e) {
          providerRaw = "PROVIDER_CANCEL_FAILED";
        }

        try {
          await strapi.db.transaction(async (trx) => {
            const actQ = strapi.db.query("api::activation.activation");
            const userQ = strapi.db.query("plugin::users-permissions.user");

            // все версии одного documentId (draft + published)
            const versions = await actQ.findMany({
              where: { documentId },
              populate: { user: true },
              transacting: trx,
            });

            if (!versions?.length) return;

            // если уже обработано — выходим
            if (versions.some((v) => v.refunded === true)) return;

            const v0 = versions[0];
            const userId = v0.user?.id || v0.user;
            const code = String(v0.code || "").trim();
            const priceUsd = Number(v0.priceUsd || 0);

            // если SMS уже есть — refund не делаем, но cancel проставим
            if (code) {
              for (const v of versions) {
                await actQ.update({
                  where: { id: v.id },
                  data: { statuss: "canceled", rawLastStatus: providerRaw },
                  transacting: trx,
                });
              }
              return;
            }

            // ✅ lock: сначала всем версиям ставим refunded=true + canceled
            for (const v of versions) {
              await actQ.update({
                where: { id: v.id },
                data: {
                  statuss: "canceled",
                  refunded: true,
                  rawLastStatus: providerRaw,
                },
                transacting: trx,
              });
            }

            // refund пользователю
            if (userId && Number.isFinite(priceUsd) && priceUsd > 0) {
              const u = await userQ.findOne({ where: { id: userId }, transacting: trx });
              if (u) {
                const cur = Number(u.balanceUsd || 0);
                const next = +(cur + priceUsd).toFixed(6);
                await userQ.update({
                  where: { id: userId },
                  data: { balanceUsd: next },
                  transacting: trx,
                });

                strapi.log.info(
                  `[CRON] refunded doc=${documentId} user=${userId} +${priceUsd} => ${next}`
                );
              }
            } else {
              strapi.log.info(
                `[CRON] canceled doc=${documentId} (no refund priceUsd=${priceUsd}, userId=${userId})`
              );
            }
          });
        } catch (err) {
          strapi.log.error("[CRON ERROR] documentId=" + documentId, err);
        }
      }
    },

    options: {
      rule: "*/1 * * * *", // раз в минуту
    },
  },
};
