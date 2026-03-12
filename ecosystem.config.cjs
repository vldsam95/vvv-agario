module.exports = {
  apps: [
    {
      name: "agarvvv-game",
      cwd: "/root/agario-server/server/MultiOgarII",
      script: "npm",
      args: "start",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "agarvvv-web",
      cwd: "/root/agario-server/client/Cigar2",
      script: "npm",
      args: "start",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3100",
      },
    },
  ],
};
