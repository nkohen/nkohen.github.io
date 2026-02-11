---
title: 'Discreet Log Contracts Part 2: How They Work [Adapator Version]'
author: 'Nadav Kohen'
date: 2020-11-09
permalink: /blog/how-dlcs-work/
tags:
  - Bitcoin
  - DLCs
---

In our last Discreet Log Contract [post](/blog/what-is-a-dlc), we explored the problems faced by most existing smart contracts as well as what Discrete Log Contracts (DLCs) are at a high level. In this post we will detail what exactly what it takes to execute a DLC as well as the many benefits we reap for doing so.

* [Part 1 – What Is A Discreet Log Contract](/blog/what-is-a-dlc)
* [Part 3 – Why Discreet Log Contracts Are Great](/blog/why-dlcs-are-great)
* [Part 4 – Security and Trust Model](/blog/dlc-security-and-trust-model/)

---

As the name suggests, DLCs are based on the Discrete Log Problem (DLP). In this context, we are specifically interested in the Elliptic Curve DLP which is used by the Bitcoin protocol. This means we can be sure we aren’t adding to our set of cryptographic assumptions.

See our [Cryptography Appendix](https://web.archive.org/web/20241113012850/https://suredbits.com/cryptography-appendix/), or our Schnorr series for more depth, for details on how we use the DLP to generate public keys from private keys, and how we sign messages with private keys in such a way that only require [public keys for validation](/blog/schnorr-applications-scriptless-scripts/#discreet-log-contracts). Also see our blog post on [adaptor signatures](/blog/schnorr-applications-scriptless-scripts) for details on how signatures can be verifiably encrypted.

As discussed in the appendix, a Schnorr signature of a message is just a number which requires a private key, a private secret and the message to compute. However, verifying this signature only requires the public key, the public key associated with the secret (usually denoted as $$R$$) and the message.

In particular, it is possible to compute a public key $$P_m$$, whose private key is the valid signature of $$m$$, from just the signer’s public key and $$R$$ value! Thus, we can create our simple oracle contracts by creating Contract Execution Transactions (CETs) for each of the possible messages an oracle might sign and then having counter-parties exchange adaptor signatures of these CETs using $$P_m$$ as an adaptor point. In case the reader is unfamiliar with adaptor signatures, they are signatures which have been encrypted using some adaptor point (in this case,$$P_m$$) which can still be verified as valid signatures in their encrypted form, but which require the adaptor point's scalar (in this case this is the oracle signature of $$m$$) to decrypt into an on-chain valid signature.

Suppose that Alice and Bob wish to enter into a DLC using the SuredBits oracle which signs the message “MOON” or “CRASH” every 24 hours if the price of BTC goes up or down at the end of that 24 hours interval.

![One 2-of-2 funding transaction that can be spent to one of two CETs with different output amounts, locked using different points.](/images/blog/MoonCrashDLC.png)

1.  Like any good contract, the first step is for them to construct a _Funding Transaction._ This is a transaction with collateral input and a simple 2-of-2 multisignature output (with one key from Alice and one from Bob). Say that each of Alice and Bob put in 1 BTC and that Alice gets 1.5 BTC while Bob gets 0.5 BTC in the MOON case and Bob wins 1.5 BTC and Alice gets 0.5 BTC in the CRASH case.
2.  They now compute the two public keys $$P_{MOON}$$ and $$P_{CRASH}$$ whose scalars are the Schnorr signatures that the SuredBits oracle might broadcast. They do this using the oracle’s public key, $$P$$, along with the $$R$$-value for this event, which is broadcast daily.
3.  They each create and generate adaptor signatures for two more transactions, one for each possible event, both of which spend the Funding Transaction. We call these _Contract Execution Transactions_ (CETs). In Alice’s case, the first one will output 1.5 BTC to Alice if she can decrypt Bob's adaptor signatures using the $$P_{MOON}$$ key, this requires the oracle's signature of MOON. The second will output 0.5 BTC to Alice she can decrypt Bob's adaptor signatures using the $$P_{CRASH}$$ key, this requires the oracle's signature of CRASH.
4.  They now sign and publish the Funding Transaction to the blockchain.
5.  Now they wait 24 hours. Say that the price goes up so that the SuredBits oracle signs the message “_MOON_”.  Alice can now publish her CET and she gets 1.5 BTC.

Note that it is very easy to extend this scenario to arbitrarily many outcomes.  There happen to be some clever [schemes](https://github.com/discreetlogcontracts/dlcspecs/pull/110) to do so.  It is also relatively straightforward to extend this scheme to more parties.

We now have a more in-depth understanding of what Discreet Log Contracts are and how they work. In the next post, we will discuss why we bother with DLCs, discuss their privacy, composability and scalability benefits.