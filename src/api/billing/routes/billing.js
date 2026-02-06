export default {
  routes: [
    {
      method: "POST",
      path: "/billing/credit",
      handler: "billing.credit",
      config: {
        auth: false,
      },
    },
  ],
};
