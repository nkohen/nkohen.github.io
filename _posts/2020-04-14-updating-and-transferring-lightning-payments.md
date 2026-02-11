---
title: 'Payment Points: Updating and Transferring Lightning Payments'
author: 'Nadav Kohen'
date: 2020-04-14
permalink: /blog/updating-and-transferring-lightning-payments/
tags:
  - Bitcoin
  - PTLCs
  - Adaptor Signatures
  - Lightning
---

In this series about Payment Points on Lightning, we’ve been focusing on mechanisms that enable somewhat generic off-chain contracts. We’ve discussed how points can enforce [monotonic access structures](/blog/monotone-access-structures) and how we can use [Barrier Escrows](/blog/barrier-escrows) to make multiple payments atomic. In this last post we will further underscore the usefulness of both monotonic access structures and Barrier Escrows and how they can be combined to enable arbitrary multi-payment/contract transfer and update!

## Extended Payment Points Series:

* [Payment Points Part 1: Replacing HTCLs](/blog/replacing-htlcs)
* [Payment Points Part 2: “Stuckless” Payments](/blog/stuckless-payments)
* [Payment Points Part 3: Escrow Contracts](/blog/escrow-contracts)
* [Payment Points Part 4: Selling Signatures](/blog/selling-signatures)
* [Monotone Access Structures](/blog/monotone-access-structures)
* [Barrier Escrows](/blog/barrier-escrows)
* [Implementing Barrier Escrows](/blog/implementing-barrier-escrows)

---

As was discussed both in the [first post](/blog/monotone-access-structures/) in this series and in our discussion of [Discreet Log Contracts on Lightning](https://web.archive.org/web/20241113012850/https://suredbits.com/discreet-log-contracts-on-lightning-network/), we can create payment points which can be satisfied if the payee becomes aware of the scalar to one of any number of chosen points. We have called these OR points in the past. One of the ways in which this can be accomplished is using verifiable encryption in the following way: The payer generates a fresh scalar, $$x$$, and its point, $$X$$, and verifiably encrypts $$x$$ using any number of points $$P_1, \ldots, P_n$$ to generate encrypted values $$VEnc(x, P_1), \ldots, VEnc(x, P_n)$$ which are given to the payee along with $$X$$ and the points. The payee can verify that the encrypted values are correct and then use $$X$$ as their payment point. If the payee learns any of the scalar $$s_i$$ to point $$P_i$$ then they can use it to decrypt $$VEnc(x, P_i)$$ and learn $$x$$, allowing them to claim their payment. One nice property of this scheme that we have not mentioned before is that given such a payment point $$X$$, the payer can add new points $$P$$ dynamically by revealing $$VEnc(x, P)$$ to the payee. We can use this property to dynamically update the contracts of payment points, but only in a very restrictive and additive way (i.e. there is no revocation). However, we will use this simple update mechanism to enable the construction of a more general one.

Our goal is to construct a procedure under which we can take any number of set up payments (for example, a contract consisting of multiple payments which were set up atomically, like a [Lightning DLC](https://suredbits.com/discreet-log-contracts-on-lightning-network/)), and atomically cancel these payments while setting up new ones. It will be extremely important that the cancellation be made atomic with the setting up of new payments as otherwise the procedure would be vulnerable to use in forcing counter-parties to exit contracts they do not wish to cancel. We will begin by narrowing our scope to transferring just a single lightning payment, and then extend this to arbitrary sets of payments.

Let us consider a scenario in which Alice has a payment set up towards Bob with payment point $$B+P$$ and we wish to transfer this payment to be from Carol to Dave with point $$D+P’$$. Note that it could be the case that Alice is Carol and/or Bob is Dave and/or $$P = P’$$ and many other combinations of parties being equal but I will give every person and point a new name so as to remain fully general. The naive approach would be to simply have Bob fail his PTLC and Carol set up her PTLC, but this requires trust between counter-parties. Luckily, we have introduced [Barrier Escrows](/blog/barrier-escrows) to mitigate this issue, transferring trust from counter-parties to a trusted and oblivious third party (Barrier Escrow), Erin.

Now since we cannot utilize Erin’s point, $$E$$, to make a payment cancellation atomic, we instead propose that Bob set up a payment to Alice of equal value to the one she has set up towards him. This does incur each of Alice and Bob a cancellation fee (paid to the routers) but this fee is both small and fair (as the routing nodes have been holding PTLCs, requiring they lock up their capital). We can now add the point $$E$$ to each of the three payment points to make atomic the cancellation payment made by Bob, and the payment set up from Carol to Dave.

But this still leaves us with our original payment from Alice to Bob with point $$B+P$$, which cannot be claimed without knowledge of the scalar to $$P$$. Hence, we propose that rather than using $$P$$ directly, we instead use a point $$X_B^A$$(generated for Bob by Alice) for which Alice gives Bob the value $$VEnc(x_B^A, P)$$. This modification allows Alice to compute $$VEnc(x_B^A, E)$$ and share this with Bob, allowing him to claim his payment upon learning the scalar to $$E$$. Finally, once all of these payments with points modified by $$E$$ are set up, including the payment between Carol and Dave, we can contact Erin using a High AMP as described in [this post](/blog/implementing-barrier-escrows), to atomically reveal the scalar to $$E$$ to all parties involved, allowing Alice and Bob to claim their payments (of equal value) and finishing the set up process for Carol and Dave. All of this is visualized in the following diagram:

![Alice and Bob transfer their contingent payment to Carol and Dave.](/images/blog/PTLCTransfer.png)

---

We now have a mechanism that allows us to not only transfer arbitrary lightning payments, but more generally to update them as well. We can think of a transfer as simply an update in the set of participants, but we can also update the points and the values of the payments if parties agree (which they all must otherwise step 3 will never be completed above).

Note however, that in using our modified point mechanism in which we use some value $$X_B^A$$ instead of $$P$$, we alter Proof of Payment (PoP). Specifically, Alice still receives PoP in the form of the scalar to the point $$B$$ in the payment point $$B+X_B^A$$, but this method of constructing points is incompatible with protocols which require the (scalar) preimage to $$P$$ be revealed to Alice atomically with payment completion. This seems to be a necessary trade-off with any ORing process in which the pre-images are not known to the generator of the combined point. Furthermore, this trade-off seems to be acceptable for many applications, such as in enabling the novation/sale of Discreet Log Contracts, which we will discuss in a future post.

Finally, we wish not only to transfer single payments but arbitrary contracts made up of multiple payments. We can simply repeat the above process for each payment, but where we reuse the same Barrier Escrow with the same point, $$E$$, across all transfers simultaneously. In this way, we are essentially doing nothing more than an atomic multi-payment set up as described in a [previous post](/blog/barrier-escrows)! The only difference is that some of the payments being set up are cancellation payments and that the currently set up payments are dynamically updated to include the point $$E$$ using our OR mechanism.

---

And that is all there is to it. We can now atomically construct multi-payment contracts where each payment is contingent on arbitrary monotonic access structures (including the use of oblivious third parties like oracles and escrows) and where we can safely perform arbitrary updates and transfers to these contracts, all without touching the blockchain!

This concludes our second series delving into the wonderful world of PTLCs and Payment Points. To see our previous series, [click here](/blog/replacing-htlcs). To see a worked out example of atomically setting up arbitrary Discreet Log Contracts on Lightning, [click here](https://web.archive.org/web/20241113012850/https://suredbits.com/discreet-log-contracts-on-lightning-network/). And to see a detailed example of transferring arbitrary DLCs on Lightning, stay tuned for our next post!