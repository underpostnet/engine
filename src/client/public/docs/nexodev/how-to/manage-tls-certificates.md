# Manage TLS certificates

`node bin tls` owns the TLS of each host the deployments declare: the ACME ClusterIssuer, the cert-manager
Certificates, the TLS Secrets and the self-signed certificates of a development cluster. `node bin deploy`
creates none of them. [ADR 0014](../../underpost/adr/0014-operational-cli-domains.md) records the domains,
and [ADR 0015](../../underpost/adr/0015-tls-lifecycle-and-the-acme-issuer.md) the TLS decisions.

## The TLS policy of an environment

`engine-private/deploy/conf.cluster.json` names the routing provider and the TLS policy of each
environment:

```json
{
  "environments": {
    "production": {
      "context": "kubernetes-admin@kubernetes",
      "cluster": { "fingerprint": "3f2a1b0c-5d4e-4f60-8a7b-9c0d1e2f3a4b" },
      "profile": "recommended",
      "routing": { "provider": "gateway-api" },
      "tls": { "mode": "cert-manager", "issuer": "letsencrypt-prod" }
    },
    "development": {
      "context": "kind-kind",
      "profile": "recommended",
      "routing": { "provider": "gateway-api" },
      "tls": { "mode": "self-signed" }
    }
  }
}
```

| Mode           | The TLS Secret of a host                                                    |
| -------------- | --------------------------------------------------------------------------- |
| `cert-manager` | cert-manager issues it from the ClusterIssuer of `issuer` and renews it     |
| `self-signed`  | this machine issues it with `scripts/ssl.sh`; only clients that trust it do |
| `none`         | none: the Gateway listeners and HTTPProxies serve HTTP only, without HTTP/3 |

No environment has a default. A command that renders routing or TLS refuses an environment without
`routing` or `tls`, and so does every change of its cluster; the message names the key. Choose the policy of `test` by its trust and its reachability: a
cluster the internet reaches can take `{"mode": "cert-manager", "issuer": "letsencrypt-staging"}`, which
issues untrusted certificates without the rate limits of production; a local one takes `self-signed`.

`issuer` is `letsencrypt-prod` or `letsencrypt-staging`, from `manifests/<issuer>.yaml`. The HTTP-01
challenge follows `routing.provider`: an HTTPRoute on the Gateways with `gateway-api`, a Contour Ingress
with `contour`.

The policy decides the HTTPS listener of each host when `node bin deploy --build-manifest` renders the
routes. No deploy flag changes it.

A self-signed certificate is trusted where its store is: the store `.underpost/ssl` of the machine that
issued it. Each other device and node needs that certificate in its own trust store. `tls renew --host
<host>` issues a new one before it expires and replaces the Secret in one apply. The private key of the
local CA never leaves that machine: no node and no workload receives it. A self-signed certificate is
not cert-manager: nothing renews it on its own.

## Select the hosts

Every operation takes one selector pattern:

```bash
node bin tls <operation> --env <env> [--deploy-id <ids>] [--host <hosts>] [--all] [--apply]
```

- `--deploy-id dd-lampp` selects each host the deployment declares: the hosts of its `conf.server.json`,
  its `www` and redirect hosts included, and the hosts of its `conf.instances.json`.
- `--host ayleenbertini.com` selects one host, with the one deployment that declares it. A host that two
  deployments declare refuses; name the deployment with `--deploy-id`.
- Without a selector, a read covers every deployment of `dd.routes`. A change needs a selector or `--all`.
- A change needs `--env`. Each command reaches the context of the environment. A section without `context`
  is refused in every environment; `--context <name>` names one for a command, and `--current-context`
  takes the current one. The first change verifies the cluster against `environments.<env>.cluster`
  and prints it ([the context of a command](place-resources-in-namespaces.md#the-context-of-a-command)).

## Read the TLS of a deployment

```bash
node bin tls status --deploy-id dd-lampp --env production
node bin tls audit --deploy-id dd-lampp --env production
```

`status` prints the mode, the issuer and one line for each host: the state of its objects, its Secret and
its expiry. `audit` prints the findings and exits 3 on an error. Neither changes the cluster. Both read the
Kubernetes objects only: a `ready` host has a Ready Certificate, not yet a public HTTPS answer. Read the
certificate a client receives from outside the cluster:

```bash
openssl s_client -connect lampp.test:443 -servername lampp.test </dev/null | openssl x509 -noout -subject -issuer -dates
```

| State       | Meaning                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| `ready`     | The Certificate is Ready, or the self-signed Secret is valid                               |
| `issuing`   | cert-manager issues the Certificate now                                                    |
| `not-ready` | The Certificate is not Ready and does not issue                                            |
| `failed`    | cert-manager failed to issue the Certificate                                               |
| `unrenewed` | A valid Secret has no Certificate that renews it                                           |
| `misplaced` | The Secret is in another namespace than the routing object that serves the host            |
| `missing`   | No Secret and no Certificate exist                                                         |
| `invalid`   | The Secret holds no certificate for the host, or an expired one                            |
| `unrouted`  | No routing object serves the host, and it has no valid Secret: deploy the deployment first |
| `foreign`   | A Certificate of another deployment renews the Secret                                      |
| `http-only` | The environment serves HTTP only                                                           |

The Secret of a host is in the namespace of the Gateway that serves it: the Gateway of its deployment
where the deployment runs, else where its placement puts it. `node bin ingress status` shows that Gateway
and the listeners and routes of each host.

## Reconcile

```bash
# Preview: each change is a server dry run
node bin tls reconcile --deploy-id dd-lampp --env production

# Apply, then read the cluster again
node bin tls reconcile --deploy-id dd-lampp --env production --apply
```

A reconcile does these steps, in this order:

1. The issuer lists the Gateway of each host. It keeps each Gateway it lists that still exists.
2. A valid Secret in another namespace is copied where its Gateway reads it, after a check of its key,
   names and expiry. A valid Secret in place stays as it is.
3. Each host gets the Certificate that renews its Secret, with the labels of its deployment. A spec that
   does not name the host or the issuer is corrected. A Certificate of another deployment is never
   changed.
4. In the self-signed mode, each missing or expiring Secret is issued on this machine and applied in one
   apply. The key stays in `.underpost/ssl`, outside Git.
5. A pending ACME Challenge whose route does not name the serving Gateway is removed: cert-manager
   creates it again from the issuer.
6. The reconcile waits until each Certificate it created is Ready, for at most 3 minutes. Then it
   removes each Certificate of the host that renews a Secret nothing serves, with `--cascade=orphan`. Its
   Secret stays.

A reconcile never deletes a Certificate or a TLS Secret to force an issue, and never changes a
Deployment, Service or volume.

## Renew a certificate

```bash
node bin tls renew --host ayleenbertini.com --env production --apply
```

In the cert-manager mode, `renew` sets the `Issuing` condition of the Certificate, as `cmctl renew` does:
cert-manager issues it again and replaces the Secret in place. A host without a Certificate refuses: run
`tls reconcile` for it first. In the self-signed mode, `renew` issues a new local certificate and applies
it.

## The ACME issuer

```bash
node bin tls issuer status --env production
node bin tls issuer reconcile --env production --apply
```

The ClusterIssuer `letsencrypt-prod` serves every namespace and every environment of the cluster. It
lists each live Gateway Underpost labels, of the Gateway class, with an HTTP listener on port 80 that
admits a route of its own namespace. `issuer status` prints the Gateways it lists, the inventory, the
Gateways a reconcile adds or drops, and each Gateway it excludes with the reason. A reconcile drops only a
Gateway that no longer exists. `node bin cluster --cert-manager` installs cert-manager, then runs the same
reconcile.

The issuer serves each environment of `conf.cluster.json` that names it in the cert-manager mode and
reaches the same cluster; `issuer status` lists them under `Serves`, so a change shows every environment
it reaches. One ClusterIssuer has one solver: when two of those environments route through two providers,
every TLS command of them is refused. Give the environment of the other provider its own issuer.

`issuer status` also says when the solver of the provider has no ACME staging evidence: no provider has it
yet. The cert-manager compatibility policy keeps upstream support, Underpost evidence and staging evidence
apart: see [ADR 0015, decision 7](../../underpost/adr/0015-tls-lifecycle-and-the-acme-issuer.md).

The Gateway API provider answers each HTTP-01 challenge with a `gatewayHTTPRoute` on the HTTP listener of
port 80; Contour answers it with an Ingress of the `contour` class. Neither needs an HTTPS listener to
issue the first certificate.

## Findings

| Finding                             | Severity | Meaning                                                                              |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `tls-unrenewed`                     | error    | A valid Secret has no Certificate that renews it                                     |
| `tls-misplaced`                     | error    | Another namespace holds the Secret the routing object names                          |
| `tls-secret-missing`                | error    | The Secret does not exist                                                            |
| `tls-invalid`                       | error    | The Secret holds no valid certificate for the host                                   |
| `tls-reference-ungranted`           | error    | A listener names a Secret of another namespace without a ReferenceGrant              |
| `listener-tls-missing`              | error    | The Gateway has no HTTPS listener for the host: deploy it again                      |
| `challenge-listener-missing`        | error    | The Gateway has no HTTP listener on port 80 for the host                             |
| `certificate-failed`                | error    | cert-manager failed to issue the Certificate                                         |
| `certificate-foreign`               | error    | A Certificate of another deployment renews the Secret                                |
| `issuer-missing`                    | error    | The ClusterIssuer does not exist                                                     |
| `issuer-not-ready`                  | error    | The ClusterIssuer is not Ready                                                       |
| `issuer-solver-mismatch`            | error    | The issuer solves challenges through another routing stack                           |
| `issuer-gateway-missing`            | error    | The issuer does not list the Gateway of a host                                       |
| `acme-challenge-stale`              | error    | A pending Challenge routes through another Gateway                                   |
| `cert-manager-missing`              | error    | cert-manager is not installed                                                        |
| `cert-manager-gateway-api-disabled` | error    | cert-manager runs without its Gateway API support: `node bin cluster --cert-manager` |
| `cert-manager-restart-needed`       | error    | cert-manager started before the Gateway API CRDs: `kubectl rollout restart` it       |
| `cert-manager-unsupported`          | error    | cert-manager is older than v1.15.0 and cannot enable its Gateway API solver          |
| `cert-manager-end-of-life`          | warning  | Upstream no longer supports the minor line of the release cert-manager runs          |
| `cert-manager-untested`             | warning  | Underpost has no evidence for the release cert-manager runs                          |
| `tls-unrouted`                      | warning  | No routing object serves the deployment, and its hosts hold no valid Secret          |
| `tls-issuing`                       | warning  | The Certificate issues now                                                           |
| `certificate-not-ready`             | warning  | The Certificate is not Ready and does not issue                                      |
| `certificate-renewal-overdue`       | warning  | The Certificate passed its renewal time and does not renew                           |
| `certificate-spec`                  | warning  | The Certificate does not name the host or the issuer                                 |
| `certificate-duplicate`             | warning  | A Certificate of the host renews a Secret nothing serves                             |
| `certificate-unexpected`            | warning  | A Certificate renews a self-signed Secret                                            |
| `acme-challenge-stuck`              | warning  | A Challenge is pending for more than ten minutes, or failed                          |

`node bin namespace audit` lists the same findings, except `tls-unrouted`, and `node bin namespace repair`
runs the same reconcile for every host.

## Move a production cluster to the TLS domain

Run these steps on the control node, which holds the production context, after the engine and
`engine-private` are up to date there.

1. Name the context, the cluster identity, the routing provider and the TLS policy of production in
   `engine-private/deploy/conf.cluster.json`, as [the policy section](#the-tls-policy-of-an-environment)
   shows. `kubectl config current-context` prints the context of the control node, and
   `node bin namespace target --env production --current-context` prints the `cluster` value to declare.

2. Read the issuer and the findings. Nothing changes:

   ```bash
   node bin tls issuer status --env production
   node bin tls audit --env production
   ```

3. Preview, then apply, the reconcile of each deployment. For LAMPP, whose TLS Secrets reached
   `underpost-workloads` without their Certificates:

   ```bash
   node bin tls reconcile --deploy-id dd-lampp --env production
   node bin tls reconcile --deploy-id dd-lampp --env production --apply
   ```

   Do the same for each other deployment, or once with `--all`.

4. Drop the Gateways the issuer still lists that no longer exist:

   ```bash
   node bin tls issuer reconcile --env production --apply
   ```

5. Check the result: `node bin tls status --env production` shows each host `ready` or
   `issuing`, and `node bin namespace audit --env production` shows no `tls-*` error.

6. Remove the `secret.yaml` files that earlier builds left in `engine-private/conf/<deploy-id>/build/production/`:
   no command reads them.
