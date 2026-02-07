"use strict";

export default {
  async credit(ctx) {
    const SECRET = process.env.INTERNAL_BILLING_SECRET;
const got = ctx.get("x-internal-secret");
    if (!SECRET || got !== SECRET) return ctx.unauthorized("BAD_INTERNAL_SECRET");

    const { userId, amountUsd, paymentId } = ctx.request.body || {};
    const uid = Number(userId);
    const amt = Number(amountUsd);

    if (!Number.isFinite(uid) || uid <= 0) return ctx.badRequest("BAD_USER_ID");
    if (!Number.isFinite(amt) || amt <= 0) return ctx.badRequest("BAD_AMOUNT");
    if (!paymentId) return ctx.badRequest("NO_PAYMENT_ID");

    // 1) Найти topup по paymentId (providerRef)
    const topup = await strapi.db.query("api::topup.topup").findOne({
      where: { provider: "nowpayments", providerRef: String(paymentId) },
      select: ["id", "amountUsd", "statuss", "processed"],
      populate: { user: { select: ["id"] } },
    });

    if (!topup) return ctx.notFound("TOPUP_NOT_FOUND");

    // безопасность: не даём начислять чужому
    const topupUserId = topup?.user?.id;
    if (Number(topupUserId) !== Number(uid)) return ctx.forbidden("TOPUP_USER_MISMATCH");

    // начисляем только если paid
if (String(topup.statuss) !== "paid") {
  await strapi.db.query("api::topup.topup").update({
    where: { id: topup.id },
    data: { statuss: "paid" },
  });
  topup.statuss = "paid";
}
    // 2) Проверка на дубль: уже есть ledger по refId=topup.id
    const existing = await strapi.db.query("api::ledger.ledger").findOne({
      where: {
        type: "topup",
        refType: "topup",
        refId: String(topup.id),
      },
      select: ["id"],
    });

    if (existing) {
      ctx.body = { ok: true, alreadyCredited: true, ledgerId: existing.id, topupId: topup.id };
      return;
    }

    // 3) Получаем текущий баланс
    const user = await strapi.db.query("plugin::users-permissions.user").findOne({
      where: { id: uid },
      select: ["id", "balanceUsd"],
    });

    if (!user) return ctx.notFound("USER_NOT_FOUND");

    const current = Number(user.balanceUsd ?? 0);
    const next = current + amt;

    // 4) Обновляем баланс
    await strapi.db.query("plugin::users-permissions.user").update({
      where: { id: uid },
      data: { balanceUsd: next },
    });

    // 5) Пишем ledger (журнал денег) — это и есть идемпотентность
    const ledger = await strapi.db.query("api::ledger.ledger").create({
      data: {
        user: uid,
        type: "topup",
        amountUsd: amt,
        reason: "Topup paid",
        refId: String(topup.id),
        refType: "topup",
        balanceAfterUsd: next,
        publishedAt: new Date().toISOString(),
      },
    });

    ctx.body = {
      ok: true,
      credited: true,
      paymentId,
      topupId: topup.id,
      ledgerId: ledger.id,
      oldBalance: current,
      newBalance: next,
    };
  },
};
