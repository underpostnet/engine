# ADR 0015 — TLS lifecycle and the ACME issuer

## Status

Accepted. [ADR 0014](0014-operational-cli-domains.md) gives the `tls` domain its ownership.

## Context

One cluster-scoped ClusterIssuer, `letsencrypt-prod`, answers every HTTP-01 challenge of the cluster
through the Gateway API. cert-manager puts the challenge route in the namespace of the Certificate and
attaches it to each Gateway the issuer lists; a listener admits only a route of its own namespace. A
Challenge keeps the solver it was created with, so an issuer change does not reach it. A deploy rewrote
the issuer from the view of its own deployment, deleted each Certificate and created it again, and a
migration copied a Certificate only when its source had one.

## Decisions

1. **One TLS policy for each environment.** `environments.<env>.tls` of `conf.cluster.json` is
   `{"mode": "cert-manager", "issuer": "<issuer>"}`, `{"mode": "self-signed"}` or `{"mode": "none"}`. No
   environment has a default: a command that renders TLS refuses an environment without a policy, and
   names the key. The mode decides the HTTPS listeners and the TLS virtual hosts. `issuer` is a
   ClusterIssuer Underpost ships, `letsencrypt-prod` or `letsencrypt-staging`, from `manifests/<issuer>.yaml`;
   the staging issuer is for a repeated test against public DNS. The kind is always ClusterIssuer, and the
   challenge follows the routing provider: a Gateway API HTTPRoute (`gatewayHTTPRoute`), or a Contour
   Ingress (`ingress.class: contour`). The `none` mode renders no HTTPS listener, no TLS virtual host, no
   QUIC policy and no `Alt-Svc` header: HTTP/3 rides on the HTTPS listener.
2. **One Secret for each host.** The TLS Secret of a host is named after the host, in the namespace of
   the routing object that serves it. A Secret in another namespace needs a ReferenceGrant there.
3. **The Certificate comes from the host.** `tls` renders it from the host and its deployment, with the
   ownership labels, and never copies one. It creates a Certificate where a challenge can be answered,
   or where a valid Secret makes one unnecessary: never for a host that no routing object serves and that
   has no valid Secret.
4. **Valid Secrets stay.** A reconcile keeps a valid Secret in place and copies a valid one from another
   namespace, after a check of its key, names and expiry. It never deletes a Certificate or a Secret to
   force an issue. It corrects the spec of a Certificate its deployment owns, and removes a Certificate
   of the host that renews an unserved Secret, with `--cascade=orphan`, once the Certificate that
   replaces it is Ready.
5. **The issuer lists the inventory.** Of the two options, a shared solver Gateway or an inventory of the
   Gateways, the inventory stays. The issuer lists each live Gateway Underpost labels, of the Gateway
   class, that the controller programs, with an HTTP listener on port 80 that the controller accepts and
   that admits a route of its own namespace, and each Gateway it lists that still exists. It never drops a live Gateway. The issuer is cluster-scoped, so the inventory
   covers every environment the cluster serves. Only `tls` changes it: `tls issuer reconcile`,
   `tls reconcile` when the Gateway of a host is missing from it, and `cluster --cert-manager` through
   the same API. Its consumers are the environments of `conf.cluster.json` that name it in the
   cert-manager mode and reach the same cluster (the same context, or the same declared fingerprint);
   `tls issuer status` lists them. A ClusterIssuer has one solver, so two consumers with two routing
   providers are refused before any change: each provider takes its own issuer.
6. **A stale challenge is created again.** A pending Challenge whose solver does not name the Gateway
   that serves its host never resolves: a reconcile removes it, and cert-manager creates it again from
   the issuer. A Challenge pending for more than ten minutes is reported with the reason of its
   self-check.
7. **The controller is checked, not assumed.** `CERT_MANAGER_RELEASES` holds the compatibility policy, and
   keeps three facts apart: the minor lines upstream supports, the releases Underpost has evidence for, and
   the routing providers whose ACME issuance and renewal passed against the Let's Encrypt staging server.
   A release older than the minimum cannot enable the Gateway API solver: an error. A release of a minor line
   upstream no longer supports is a warning (`cert-manager-end-of-life`), and so is a release without
   Underpost evidence (`cert-manager-untested`): an untested release is not an incompatible one, and an old
   tested one is not a supported one. `tls issuer status` says when the solver of a provider has no staging
   evidence. A controller without its Gateway API support is an error, and so is a controller pod that
   started before the HTTPRoute CRD existed: it watches no HTTPRoute until a restart. The HTTP challenge
   needs only the HTTP listener on port 80, never an HTTPS listener.

   | Fact                       | Value                                    | Source                                                                                  |
   | -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
   | Installed                  | v1.17.0                                  | `cluster --cert-manager`                                                                |
   | Minimum                    | v1.15.0                                  | the first `enableGatewayAPI` release                                                    |
   | Upstream supported         | 1.20 and 1.21                            | https://cert-manager.io/docs/releases, read 2026-11-10 (1.17 ended 2025-10-07)          |
   | Underpost evidence         | v1.17.0                                  | production issues Certificates through `gatewayHTTPRoute` (operator output, 2026-11-09) |
   | Staging-verified providers | none                                     | the Verification section                                                                |
   | Solver, gateway-api        | HTTP-01 through `gatewayHTTPRoute`       | the inventory of decision 5                                                             |
   | Solver, contour            | HTTP-01 through `ingress.class: contour` | one Contour IngressClass                                                                |

   Production evidence is not staging evidence: it shows issuance, not a verified renewal or a provider
   change.

8. **Renewal marks, never deletes.** `tls renew` sets the `Issuing` condition of the Certificate, as
   `cmctl renew` does. In the self-signed mode it issues a new local certificate and applies it.
9. **Self-signed trust is local.** The machine that runs `tls reconcile` issues each certificate into its
   local store `.underpost/ssl`, outside Git, and is the only holder of its key. Only the clients that
   trust that store trust the certificate: no device and no other node does. `tls renew` issues a new one;
   one apply replaces each Secret, and nothing is deleted first.
10. **Control plane and data plane are verified apart.** `tls status` and `tls audit` read the
    Kubernetes objects only: the issuer, the Certificates, the Secrets, the challenges and the listeners.
    Their output says so, and names the command that reads the public side: DNS, TCP, the TLS handshake and
    the certificate a client receives (`openssl s_client -connect <host>:443 -servername <host>`). A Ready
    Certificate is not a public HTTPS answer.

## Alternatives considered

- **A shared solver Gateway in the platform namespace.** Its HTTP listeners would collide with the
  listeners of the deploy Gateways in the merged data plane, which keys them by port, protocol and host,
  and every route namespace would need its admission. Rejected for decision 5.
- **The Gateways a deploy will create, listed in advance.** The inventory could not verify them. Rejected:
  `tls reconcile` runs after the deploy that creates the Gateway.
- **Copy the source Certificate in a migration.** A source without one gave a destination without one.
  Rejected for decision 3.
- **Delete and create a Certificate to renew it.** It issues a new certificate on each deploy and leaves
  a window without one. Rejected for decision 7.

## Consequences

- `namespace repair` reports a TLS Secret without its Certificate as `tls-unrenewed`, an error, and
  creates the Certificate.
- A migration unit fails its preparation when a TLS Secret is placed without its Certificate, before
  anything is deleted, and its install ends with `tls reconcile`.
- `test/underpost/integration/cluster/namespace-tls-repair.test.js` keeps the LAMPP migration as a
  regression scenario.

## Verification

Unit and harness tests prove the planning rules. The operational evidence the decisions need comes from a
disposable cluster with the pinned releases, never from production:

1. Two deployment Gateways in two namespaces, each listener `Same`; two Certificates of two owners.
2. Each challenge route attached to the Gateway that serves its host, and accepted.
3. A Gateway whose HTTP listener is refused or not programmed: excluded, and no route attaches.
4. A Gateway removed during `tls issuer reconcile`: the issuer drops it, and keeps every other one.
5. Issuance and renewal with `letsencrypt-staging` against controlled public DNS, through the public edge:
   the challenge route answers, the Certificate is Ready, the Secret holds the host, an external HTTPS
   handshake serves it, and a renewal replaces the Secret.
6. Steps 2 and 5 again with the Contour provider and its Ingress solver.

A shared solver Gateway stays unneeded unless step 2 fails.

## Design decisions

- One ClusterIssuer serves each cluster, with one solver: two providers take two issuers (decision 5).
- A self-signed certificate is no evidence of ACME issuance.

## Operational constraints

- ACME issuance needs public DNS for each host, and ports 80 and 443 reachable from the internet through the
  public edge.

## Known limitations

- `cluster --cert-manager` installs v1.17.0, a release upstream stopped supporting on 2025-10-07. A move to
  a supported release needs the staging steps below on that release first.
- `tls audit` does not probe public HTTPS.

## Verification pending

- Steps 1 to 6 above, for each provider. No ACME issuance or renewal against the staging server has run
  through Underpost, and no renewal has been verified on a public host.
