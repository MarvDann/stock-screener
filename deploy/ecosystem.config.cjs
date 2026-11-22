// PM2 process for stockwatch.cloud. `cwd` is the `current` release symlink,
// so each reload starts the release deploy.sh just switched to.
module.exports = {
  apps: [
    {
      name: "stockwatch",
      cwd: "/var/www/stockwatch.cloud/current",
      script: "dist/server.js",
      // Secrets live on the server only, outside the release directories.
      node_args: "--env-file=/home/stockwatch/config/.env",
      env: { HOST: "127.0.0.1" },
      max_memory_restart: "1G",
      time: true,
    },
  ],
};
