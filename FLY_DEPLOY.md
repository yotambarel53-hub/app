Fly deployment steps

1. Install `flyctl`:

- macOS: `brew install flyctl`
- Windows: `scoop install flyctl` or use the installer at https://fly.io/docs/hands-on/install-flyctl/

2. Login and create the app (run locally):

```bash
flyctl auth login
flyctl apps create --name marketplace-app
```

3. Deploy:

```bash
# from the repository root
flyctl deploy --config fly.toml
```

4. (Optional) If you want a Postgres DB later, add it via:

```bash
flyctl postgres create --name marketplace-db
```

Notes:
- The app listens on the `PORT` env var; Fly sets it automatically.
- `marketplace-data.json` is local and ephemeral inside the VM; consider switching to a persistent DB for production.
