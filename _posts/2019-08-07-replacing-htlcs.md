---
title: 'Payment Points Part 1: Replacing HTLCs'
author: 'Nadav Kohen'
date: 2019-08-07
permalink: /blog/replacing-htlcs/
tags:
  - Bitcoin
  - PTLCs
  - Adaptor Signatures
  - Lightning
---

## Payment Points Series:

* [Payment Points Part 2: “Stuckless” Payments](/blog/stuckless-payments)
* [Payment Points Part 3: Escrow Contracts](/blog/escrow-contracts)
* [Payment Points Part 4: Selling Signatures](/blog/selling-signatures)

---

In Lightning v1.0, routed payments are enabled by Hashed Timelock Contracts (HTLCs). These are contracts for conditional payment that say Alice will send Bob the specified bitcoin if Bob reveals the pre-image to a specified hash. Otherwise Alice gets her bitcoin back after some specified time.

These contracts can then be linked together using a unified “payment hash”. We have discussed these in the previous [posts](https://web.archive.org/web/20241113012850/https://suredbits.com/lightning-network-101-routing/), but here’s a refresher:

Say Alice wishes to pay Carol one bitcoin through Bob. Then Alice can give Bob an HTLC for 1.01 bitcoin using the condition that he must provide Alice with a pre-image to $$H$$, which Carol knows. Bob is then told to go to Carol with an HTLC worth one bitcoin in return for the pre-image to the same hash, $$H$$. Carol can then collect her money by revealing the pre-image to Bob, and only then can Bob collect his 1.01 bitcoin from Alice.

This gets the job done and successfully makes lightning routing atomic (meaning that either all payments in a route succeed or they all fail). But using payment hashes to do this comes with a couple of drawbacks. Primarily, all payments along a given route can be linked by their hash! This means that two nodes sharing information (for example, because they’re owned by the same person) can know if they are in a route together by seeing that they have received HTLCs with the same hash. This not only gives them information about routing that we don’t want them to have access to, but it also allows them to perform a “wormhole attack” which consists of them working together to steal the fees of all intermediate hops between them [[1]](#references).

Say Mallory and Mike are malicious and discover that they are in a route together. Further, assume Mallory has an incoming HTLC with 1.1 bitcoin and Mike has an incoming HTLC with the same hash for 1 bitcoin. (The 0.1 bitcoin difference accounts for the sum of all fees for intermediate hops between Mallory and Mike). If Mike forwards the payment and eventually ends up paying 1 bitcoin and learning the hash pre-image, he can give this pre-image directly to Mallory who can now claim 1.1 bitcoin – without paying anything! Once she reveals this pre-image routing continues as usual and no node before Mallory or after Mike will know that anything has happened. Meanwhile, Mallory and Mike combined have paid 1 bitcoin and gained 1.1 bitcoin, collecting all of the fees of intermediate hops. And what’s worse, these intermediate hops are left having their funds locked up in an unusable state until the payment times out (because Mike is malicious and doesn’t inform them of anything); the intermediate nodes cannot tell the difference between a payment stalling and failing for benign reasons versus a malicious fee-stealing attack!

![Depiction of a Wormhole Attack](/images/blog/WormholeAttack.png)

There is an outstanding proposal that fixes this problem (as well as introducing a bunch of cool new features) in which we replace pre-images and hashes with “scalars” and “payment points”. This means that rather than making payments atomic by using some hash, $$h(a)$$, with some pre-image, $$a$$, we instead treat $$a$$ as a private key and create a contract that requires that the payee must reveal the private key to a public key $$A = a \cdot G$$ in order to claim funds (where $$G$$ is a point on an elliptic curve, and thus $$a \cdot G = G + G + \dots + G$$ ($$a$$ times) reveals no information about the private key, $$a$$).

So far no problems have been solved, but moving from hashes to (homomorphic) one-way functions means that we can do operations (namely addition and subtraction) on our public output points where that operation is then reflected in the private input scalars: $$(a \cdot G) + (b \cdot G) = (a + b) \cdot G$$ whereas $$hash(a) + hash(b)$$ is completely unrelated to $$hash(a+b)$$. Essentially, the problem with hashes in this context is that they destroy information, whereas not all information is destroyed by homomorphic one-way functions. Now we use this to our advantage to de-correlate payments.

![Visualization of Alice routing through Bob to Carol using PTLCs](/images/blog/PaymentPoint.png)

Example: Alice wants to pay Carol through Bob.

1.  Carol has a secret $$z$$ and gives $$z\cdot G$$ to Alice (in an invoice).
2.  Alice now chooses 2 random numbers $$x$$ and $$y$$.
3.  She gives Bob an HTLC-like contract where he receives bitcoin if he reveals the private key associated with $$(x + z)\cdot G$$, which is just $$(x+z)$$.
4.  Alice gives Bob $$y$$ and tells him that Carol knows the pre-image to $$(x + z)\cdot G + y\cdot G$$, which is $$(x + y + z)$$, so Bob can use it to discover $$(x + y + z) - y = x + z$$.
5.  Alice gives Carol $$(x + y)$$ which reveals nothing about $$x$$ or $$y$$.
6.  Bob gives Carol an HTLC-like contract where she receives bitcoin if she reveals the private key associated with $$(x + y + z)\cdot G$$, which is $$(x + y + z)$$.
7.  Carol reveals $$(x + y) + z$$ to Bob to claim her bitcoin.
8.  Bob computes $$(x + z)$$ and reveals this to Alice to receive his bitcoin.
9.  Alice computes $$(x + z) – x = z$$ which acts as her PoP! (Except this PoP is even better than our current hash pre-images since only Alice learns z, and Bob doesn’t)

This scheme generalizes to an arbitrary number of hops by using a new random number for each hop. Thus every hop uses a completely different condition (since a random number is added each time) so we now have payment decorrelation! Even better, it turns out that Poelstra has shown this scheme to be possible using simple aggregated Schnorr signatures by using partial and adaptor signatures [[2]](#references) (where Taproot can be used for timelocks), so that lightning channels can be accomplished with small, simple outputs, making privacy and fees during unilateral closes better [[3]](#references).

For an in depth explanation of Schnorr signatures, partial and adaptor signatures and how they can be used to implement out payment point scheme, checkout [Rene Pickhardt’s video series.](https://www.youtube.com/playlist?list=PLaRKlIqjjguCILECVRXqVhec6yaNYyeMT)

Using payment points and their scalars, we can now atomically route payments in a decorrolated fashion. But what other new things does this scheme enable? My three favorites are a proposal for safely retrying “stuck” payments, enabling escrow contracts in lightning channels, and enabling trustless signature selling.

We will discuss these proposed new features that rely on payment points in a follow-up post.

#### References<a id="references"></a>:

[1] [Anonymous Multi-Hop Locks](https://eprint.iacr.org/2018/472.pdf)

[2] [Adaptor and Partial Signatures](https://github.com/ElementsProject/scriptless-scripts/blob/master/md/multi-hop-locks.md#notation)

[3] [Payment Points with Schnorr](https://lists.launchpad.net/mimblewimble/msg00086.html)
