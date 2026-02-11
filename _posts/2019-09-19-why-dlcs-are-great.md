---
title: 'Discreet Log Contracts Part 3: Why They Are Great'
author: 'Nadav Kohen'
date: 2019-09-11
permalink: /blog/why-dlcs-are-great/
tags:
  - Bitcoin
  - DLCs
---

In previous posts, we discussed both what Discreet Log Contracts (DLCs) are and how they work in detail. Now, let’s talk about the features of DLCs and how they make powerful oracle contracts.

* [Part 1 – What Is A Discreet Log Contract](/blog/what-is-a-dlc)
* [Part 2 – How Discreet Log Contracts Work](/blog/how-dlcs-work)
* [Part 4 – Security and Trust Model](/blog/dlc-security-and-trust-model/)

---

Discreet Log Contracts are private and secure. Not only is the contract only known by the parties involved, but not even the oracle needs to know *anything* about its users. All they need to do is broadcast signatures and can even potentially monetize (see our post on [PAID APIs](https://web.archive.org/web/20241113012850/https://suredbits.com/paid-apis/)).

The public sees nothing that can be distinguished from simple payment activity, no information goes on-chain except for the payout. Not only do oracles stay oblivious of their users but there are additional built in protections in the DLC scheme against oracles lying.  We will address the security and trust model of DLCs further in our next post.

DLCs are also very flexible. The DLC scheme can be used for contracts on just about any blockchain (including Bitcoin). All that is needed is multi-signature contracts and timeouts. Users across different blockchains and Layer 2 solutions can simultaneously use the same oracles. Further, there is a natural way to combine DLC oracles. For example, to extend the scheme described [previously](/blog/how-dlcs-work) to a 2-oracle DLC, Alice and Bob must simply add the two oracles’ P_MOON keys to get an aggregate P_MOON, whose underlying private key is simply the sum of the two oracles’ signatures!

Discreet Log Contracts are scalable. They are natural candidates for execution within payment channels such as those of the [Lightning Network](https://web.archive.org/web/20241113012850/https://suredbits.com/category/lightning-101/). It is possible to execute arbitrary DLCs completely off-chain with absolutely no on-chain footprint, fees, or privacy leaks. Even without going fully off-chain, DLCs are already mostly off-chain so that the only on-chain footprint is two simple value-transfer transactions - funding and closing. This makes DLCs a viable candidate on any chain to "allow extensive complex smart contracts to occur without unduly taxing the [global network](https://adiabat.github.io/dlc.pdf)".

Finally DLCs are composable. Essentially a DLC is an oracle contract that requires nothing but multisig or MuSig to enforce. This means that all smart-contracting platforms out there, such as Ethereum, can replace the oracle subcontracts it currently uses, with DLCs. This replacement allows those involved to enjoy all of the benefits we have highlighted.

All of this from building blocks so simple that they can be expressed in Bitcoin Script!

But what exactly are the security and trust models when it comes to executing DLCs? This will be the topic of our next post.