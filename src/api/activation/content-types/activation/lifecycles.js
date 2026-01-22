// src/api/activation/content-types/activation/lifecycles.ts

export default {
  async afterUpdate(event) {
    await handleActivationRefund(event);
  },
};

async function handleActivationRefund(event) {
  const { result, params } = event;
  const activationId = result?.id;
  if (!activationId) return;

  // уже возвращали деньги
  if (result?.refunded === true) return;

  const status = result?.status ?? params?.data?.status;
  if (!["failed", "cancel"].includes(status)) return;

  const userId = result?.user?.id ?? result?.user;
  if (!userId) return;

  const priceUsd = Number(result?.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;

  // 1) читаем баланс
  const user = await strapi.db.query("plugin::users-permissions.user").findOne({
    where: { id: userId },
    select: ["id", "balanceUsd"],
  });
  if (!user) return;

  const current = Number(user.balanceUsd || 0);
  const next = +(current + priceUsd).toFixed(4);

  // 2) обновляем баланс
  await strapi.db.query("plugin::users-permissions.user").update({
    where: { id: userId },
    data: { balanceUsd: next },
  });

  // 3) ledger
  await strapi.db.query("api::ledger.ledger").create({
    data: {
      user: userId,
      type: "refund",
      amountUsd: priceUsd,
      balanceAfterUsd: next,
      reason: `Refund activation ${status}`,
      refType: "activation",
      refId: String(activationId),
    },
  });

  // 4) отметка refunded
  await strapi.db.query("api::activation.activation").update({
    where: { id: activationId },
    data: { refunded: true },
  });
}
