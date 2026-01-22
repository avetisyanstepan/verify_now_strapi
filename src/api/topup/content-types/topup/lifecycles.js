export default {
  async afterCreate(event) {
    await handleTopup(event);
  },
  async afterUpdate(event) {
    await handleTopup(event);
  },
};

async function handleTopup(event) {
  const topupId = event?.result?.id;
  if (!topupId) return;

  strapi.log.info(`[TOPUP_LC] hit topupId=${topupId}`);

  // тянем запись заново с юзером
  const topup = await strapi.entityService.findOne("api::topup.topup", topupId, {
    populate: { user: true },
  });

  if (!topup) {
    strapi.log.warn(`[TOPUP_LC] topup not found id=${topupId}`);
    return;
  }

  if (topup.processed === true) {
    strapi.log.info(`[TOPUP_LC] already processed id=${topupId}`);
    return;
  }

  if (topup.statuss !== "paid") {
    strapi.log.info(`[TOPUP_LC] status not paid (${topup.statuss}) id=${topupId}`);
    return;
  }

  const userId = (topup)?.user?.id;
  const amountUsd = Number(topup.amountUsd);

  if (!userId) {
    strapi.log.warn(`[TOPUP_LC] no user on topup id=${topupId}`);
    return;
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    strapi.log.warn(`[TOPUP_LC] bad amountUsd=${amountUsd} id=${topupId}`);
    return;
  }

  // читаем пользователя
  const user = await strapi.entityService.findOne("plugin::users-permissions.user", userId, {
    fields: ["balanceUsd"],
  });

  const current = Number(user?.balanceUsd || 0);
  const next = +(current + amountUsd).toFixed(4);

  // обновляем баланс
  await strapi.entityService.update("plugin::users-permissions.user", userId, {
    data: { balanceUsd: next },
  });

  // ledger
  await strapi.entityService.create("api::ledger.ledger", {
    data: {
      user: userId,
      type: "topup",
      amountUsd,
      balanceAfterUsd: next,
      reason: "Topup paid",
      refType: "topup",
      refId: String(topupId),
      // если ledger тоже с Draft/Publish — публикуем:
      publishedAt: new Date().toISOString(),
    },
  });

  // processed=true
  await strapi.entityService.update("api::topup.topup", topupId, {
    data: { processed: true },
  });

  strapi.log.info(`[TOPUP_LC] DONE topupId=${topupId} userId=${userId} nextBalance=${next}`);
}
