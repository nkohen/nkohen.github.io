---
title: 'Payment Points Part 3: Escrow Contracts'
author: 'Nadav Kohen'
date: 2019-08-22
permalink: /blog/escrow-contracts/
tags:
  - Bitcoin
  - PTLCs
  - Lightning
---

In our previous post, we discussed a Lightning Network feature referred to as “[Stuckless Payments](/blog/stuckless-payments)” that requires Payment Points. Stuckless Payments allow users to attempt multiple payments concurrently. For an in depth description of Payment Points themselves and the problems they solve, see our [first post](/blog/replacing-htlcs) in this series. In this post we’ll continue this thread and discuss another outstanding proposal that would require Payment Points be implemented: Escrow Contracts over Lightning!

## Payment Points Series:

* [Payment Points Part 1: Replacing HTCLs](/blog/replacing-htlcs)
* [Payment Points Part 2: “Stuckless” Payments](/blog/stuckless-payments)
* [Payment Points Part 4: Selling Signatures](/blog/selling-signatures)

---

## Escrow Contracts On Lightning

[Escrow contracts](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-June/002051.html) are useful when Bitcoin needs to interact with external systems.

An Escrow Contract involves three parties: Alice and Bob, who wish to enter into a contract, and Erin, the trusted escrow. This contract could be for anything which Erin can be trusted to attest to. This means arbitrary smart contracts can be executed this way.  It is possible to support these arbitrary escrow contracts over Lightning if payment points are used, as was [originally proposed](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-June/002028.html) by ZmnSCPxj.

For simplicity’s sake, I will demonstrate an example in which Alice is paying for a service Bob provides that Erin is trusted, if necessary, to verify.

Alice and Bob generate random key pairs $$(a, A = a \cdot G)$$ and $$(b, B = b \cdot G)$$ respectively, and Erin has public key $$E = e \cdot G$$. Alice can compute a [secret](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange) that only she knows but which Erin can also discover should she learn the value of A. Call this value $$ae = hash(a \cdot E) = hash(e \cdot A)$$. Let $$AE = ae \cdot G$$ be the point associated with Alice and Erin’s shared secret, and let $$B’ = B + AE$$ be the payment point for Alice’s payment to Bob so that the PoP will be $$b + ae$$.

If Alice is happy with the service Bob provides she can decide to tell him what $$ae$$ is, at which point he can complete the payment. If on the other hand, Bob does not perform the service, then the payment will timeout and he will not get paid.

Now consider if either of them acts maliciously. Say that Alice does not wish to pay Bob for the service he did provide.  Then Bob can go to Erin with the value A from which she can compute $$ae$$. If Erin judges that Bob did perform the service, then Erin can share $$ae$$ with Bob, after which he can complete the payment. If on the other hand it turns out that Bob is the malicious one and he hasn’t performed the service, then Erin will not reveal $$ae$$ to Bob and he will not get paid.

More complicated contracts, in which it is not the case that one person is paying and the other getting paid, are possible by using multiple payments in both directions. Likewise, it is possible to have more than two parties involved in a contract. There are a few other details I’ve glossed over.  Most of which have to do with how this contract is kept private and how Erin does not even learn the contract unless she is called on to settle a dispute. We recommend reading the original thread on [escrow contracts](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-June/002051.html) on the lightning-dev mailing list for a more complete discussion on these matters.

In our next post we will delve even further into the world of Payment Points and look at how signatures might be sold trustlessly over the lightning network in the future.