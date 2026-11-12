const config = {
  cron: {
    records: {
      A: [
        {
          host: 'env:DDNS_HOST:example.com',
          dns: 'env:DDNS_PROVIDER:dondominio',
          api_key: 'env:DDNS_API_KEY:',
          user: 'env:DDNS_USER:',
        },
      ],
    },
    jobs: {
      dns: { expression: '* * * * *', enabled: true, instances: 1 },
      backups: { expression: '0 1 * * *', enabled: true, instances: 1 },
    },
  },
  wireguard: {
    '00.000.00.000': {
      interfaceName: 'wg0',
      listenPort: 51820,
      address: '10.0.0.1/24',
      publicKey: '',
      sshForwardPort: 2222,
      peers: [
        {
          id: 'homelab-a',
          address: '10.0.0.2',
          managementHost: '192.168.1.80',
          publicKey: '',
          allowedIPs: ['10.0.0.2/32'],
          hosts: [],
          instances: [],
          default: true,
        },
      ],
    },
  },
  event: {
    'notification-providers': {
      'default-cluster-mailer-provider': {
        type: 'mailer',
        mailer: {
          sender: { email: 'env:CLUSTER_MAILER_SENDER_EMAIL', name: 'env:CLUSTER_MAILER_SENDER_NAME:Underpost' },
          transport: {
            host: 'env:CLUSTER_MAILER_SMTP_HOST',
            port: 'env:CLUSTER_MAILER_SMTP_PORT:int:587',
            secure: 'env:CLUSTER_MAILER_SMTP_SECURE:bool:false',
            auth: { user: 'env:CLUSTER_MAILER_SMTP_AUTH_USER', pass: 'env:CLUSTER_MAILER_SMTP_AUTH_PASS' },
          },
        },
      },
    },
    events: {
      'wireguard-server-down': {
        probeInterval: '30s',
        alertFor: '5m',
        notifications: [
          {
            'notification-provider-id': 'default-cluster-mailer-provider',
            payload: { subscribers: [{ email: 'admin@default.net', name: 'Admin' }] },
          },
        ],
      },
      'wireguard-spoke-down': {
        probeInterval: '30s',
        alertFor: '2m',
        notifications: [
          {
            'notification-provider-id': 'default-cluster-mailer-provider',
            payload: { subscribers: [{ email: 'admin@default.net', name: 'Admin' }] },
          },
        ],
      },
      'public-ingress-down': {
        probeInterval: '5m',
        alertFor: '5m',
        notifications: [
          {
            'notification-provider-id': 'default-cluster-mailer-provider',
            payload: { subscribers: [{ email: 'admin@default.net', name: 'Admin' }] },
          },
        ],
      },
    },
  },
  users: [
    {
      user: 'root',
      password: '',
      groups: 'wheel',
      keyPath: './engine-private/deploy/id_rsa',
      pubKeyPath: './engine-private/deploy/id_rsa.pub',
      hosts: [{ host: '00.000.00.000', port: 22 }],
    },
  ],
  profiles: {
    legacy: {
      namespaces: {
        workloads: 'default',
        releases: 'default',
        platform: 'default',
        operations: 'default',
        observability: 'default',
        datastores: {
          mongodb: 'default',
          mariadb: 'default',
          mysql: 'default',
          postgresql: 'default',
          valkey: 'default',
          ipfs: 'default',
        },
        addons: {
          envoyGateway: 'envoy-gateway-system',
          certManager: 'cert-manager',
        },
      },
      scheduling: {
        workloads: {
          mode: 'scheduler',
        },
        releases: {
          mode: 'scheduler',
        },
        platform: {
          mode: 'scheduler',
        },
        operations: {
          mode: 'scheduler',
        },
        observability: {
          mode: 'scheduler',
        },
        datastores: {
          mode: 'scheduler',
        },
      },
    },

    recommended: {
      namespaces: {
        workloads: 'underpost-workloads',
        releases: 'underpost-releases',
        platform: 'underpost-platform',
        operations: 'underpost-operations',
        observability: 'underpost-observability',
        datastores: {
          mongodb: 'underpost-data',
          mariadb: 'underpost-data',
          mysql: 'underpost-data',
          postgresql: 'underpost-data',
          valkey: 'underpost-data',
          ipfs: 'underpost-data',
        },
        addons: {
          envoyGateway: 'envoy-gateway-system',
          certManager: 'cert-manager',
        },
      },
      scheduling: {
        workloads: {
          group: 'workers',
          mode: 'required',
        },
        releases: {
          group: 'control',
          mode: 'required',
        },
        platform: {
          group: 'control',
          mode: 'required',
        },
        operations: {
          group: 'control',
          mode: 'required',
        },
        observability: {
          group: 'control',
          mode: 'required',
        },
        datastores: {
          group: 'control',
          mode: 'required',
        },
      },
    },
  },
};

export default config;
