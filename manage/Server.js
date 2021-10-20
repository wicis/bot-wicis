const app = global.app;

app.get("*", (req, res, next) => {
  return res.status(200).json({
    active: true,
  });
});
