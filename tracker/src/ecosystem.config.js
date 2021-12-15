module.exports = {
  apps : [{
    name: 'Valve Uni Tracking',
    script: './dist/index.js',
    node_args: "--max-old-space-size=1024 -r esm",
    // Options reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
    // node_args: "--max-old-space-size=6144 -r esm",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },  
    env_production: {
      NODE_ENV: 'production'
    }   
  }]
}
