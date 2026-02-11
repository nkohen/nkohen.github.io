---
title: 'Payment Points: Implementing Barrier Escrows'
author: 'Nadav Kohen'
date: 2020-03-10
permalink: /blog/implementing-barrier-escrows/
tags:
  - Bitcoin
  - PTLCs
  - Lightning
---

In the [previous post](/blog/barrier-escrows), we discussed how to construct multi-payment Lightning contracts by using Barrier Escrows to make multiple payments atomic. In this post, we will discuss various ways of implementing Barrier Escrows and analyze their trade-offs.

## Extended Payment Points Series:

* [Payment Points Part 1: Replacing HTCLs](/blog/replacing-htlcs)
* [Payment Points Part 2: “Stuckless” Payments](/blog/stuckless-payments)
* [Payment Points Part 3: Escrow Contracts](/blog/escrow-contracts)
* [Payment Points Part 4: Selling Signatures](/blog/selling-signatures)
* [Monotone Access Structures](/blog/monotone-access-structures)
* [Barrier Escrows](/blog/barrier-escrows)
* [Transferring and Updating Contracts](/blog/updating-and-transferring-lightning-payments)

---

Let us briefly restate what is required of a Barrier Escrow before moving on to implementations. There are two kinds of requests that must be satisfied:

1.  *barrier-commit* takes as input a list of points ($$P_1, \ldots, P_n$$) and returns a point $$E$$ if
    a. None of the input points have been seen before
    b. The exact inputs ($$P_1, \ldots, P_n$$) has been received before in which case the point $$E$$ returned is the same point as was returned last time
2.  *barrier-reveal* takes as input a single scalar, $$x$$, and if it has seen $$x \cdot G$$ as part of an input list to barrier-commit ($$P_1, \ldots, P_n$$), to which it returned the point $$E$$, then it waits to receive barrier-reveal requests for each of the $$n$$ points before it then returns the scalar pre-image to $$E$$.

The requirement that no input point to barrier-commit be re-used in new lists ensures that parties using the Barrier Escrow can detect when one of their counter-parties has attempted to cheat by sending some altered list of points that was not agreed to (e.g. only their points). The requirement that no output is returned on calls to barrier-reveal until all parties have made requests ensures that no party learns the scalar behind $$E$$ until all parties are ready (i.e. all parties have received their expected incoming payments).

This is all that is truly required of a Barrier Escrow. Ideally there will also be some other properties satisfied. Namely that we wish the Barrier Escrow to be an oblivious and incentivized third party, much like a Discreet Log Contract (DLC) Oracle.

The Barrier Escrow should be oblivious, meaning that they should know as little as possible about how they are being used and what for. The interface defined above requires that they learn that they are being used and some upper bound on the number of parties involved (note that one party can have as many points as they want). Ideally the Barrier Escrow should learn as little as possible beyond this required information. They should not learn any identifying information of their users, they should never see that they have been used in a transaction and they should not learn any information about what they are being used for. Note that in particular, it is useful to have many different use cases for a Barrier Escrow so that they cannot make educated guesses about their use.

By saying the Barrier Escrow should be incentivized I mean that they should be receiving payments, or some other reward, for their use, and that there would ideally be some form of punishment if they prove to be unreliable or malicious.

Now that we have a detailed idea of what a Barrier Escrow should be, let us discuss some options for their implementation and then analyze trade-offs.

---

## Option 1: REST API

This is the tried-and-true route of implementing a simple REST API with a simple call-and-response protocol with two endpoints for barrier-commit and barrier-reveal. This is certainly the simplest solution and can be implemented today (I plan on doing so in the near future). Note that to optimize privacy, users should be encouraged (or forced) to reach this endpoint using TOR or a similar protocol which hides the client from the service. Furthermore, we can anonymously compensate the Barrier Escrow API Server for their services using [lightning paywalls](https://web.archive.org/web/20241113012850/https://suredbits.com/paid-apis/) to protect the server from DoS attacks and to incentivize good behavior.

---

## OPTION 2: Multi-Path Payments (MPPs) over Lightning

Now that some lightning implementations are enabling support for [MPPs](https://github.com/lightningnetwork/lightning-rfc/blob/master/04-onion-routing.md#basic-multi-part-payments), we could implement the second interaction with the Barrier Escrow (barrier-reveal) as Lightning nodes which are waiting to accept MPPs whose payment onions contain extra TLV data providing the users’ scalars and which returns via the payment pre-image the required scalar. Using Lightning in this way ensures privacy for the payer when interacting with the Barrier Escrow.

The first interaction (barrier-commit) can also be implemented as an MPP which has the users’ points in the TLV onion data and which returns (using the pre-image) the Barrier Escrow’s point, $$E$$. The first interaction can also be implemented using either a single-endpoint REST API as described in option 1, or better yet, by using some messaging scheme over lightning such as the proposed Lightning invoice [offers](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-November/002276.html).

---

## OPTION 3: Payment-Point AMPs over Lightning

While this is not yet possible today as it will require the use of [High AMPs](https://lists.linuxfoundation.org/pipermail/lightning-dev/2018-March/001100.html). This scheme is an illustration of what can be done with payment points as well as a very powerful implementation of a Barrier Escrow. This option is very similar to using MPPs where we make the Barrier Escrow into a lightning node awaiting multi-path payments but by using High AMPs rather than MPPs.

We can even integrate our interaction with them into our existing payments meaning that all parties set up their payments to look like partial payments in an AMP to the escrow, where the original payments now take the form of fees on a partial payment to the escrow. For this to work as our original setup did, we have particular tweaks on the hops in which the involved parties are paid so that the points they must reveal a pre-image to correspond to the expected (original) payment points plus $$E$$, and where $$E$$ is revealed to these intermediate hops.

The figure below illustrates this setup. As mentioned, how the barrier-commit is implemented is not too important (and I would probably recommend something like Lightning invoice offers).

![Visualization of three payers using a barrier escrow.](/images/blog/BEAMP.png)

---

## Analysis

Implementing a REST API is probably the most realistic option if one was to implement a Barrier Escrow today because it requires no tinkering with lightning node implementations. The downside in this scheme is that users must trust that the server is faithfully keeping track of all of their points as well as its own points, and enforcing the barrier properties as is needed. Namely they have no assurances about the code being run by the server. Another downside is that there is a potential loss of privacy if the server can track its users.

Implementing Barrier Escrows using MPPs is possible today, but will require some tinkering with lightning implementations to get the TLV data right and Barrier Escrows as well as clients will need to support these changes. Additionally trust is placed in the Barrier Escrow that the pre-image data is what it should be, as it isn’t possible to verify the correctness of the hash by simply inspecting it. An upside of this scheme over using a REST API is that it re-uses the Lightning Network’s infrastructure for privacy, and could be built on today’s Lightning Network (i.e. it is BOLT-compliant) and requires no extra work to include payments as part of interaction. Lastly, trust is placed in an MPP Barrier Escrow that it will adhere to the requirements on barrier-reveal meaning that it completes all payments only when all are setup (this trust was also required in the REST API option).

While implementing High AMP Barrier Escrows is not possible without Payment Points (which will be implemented when Schnorr is enabled on the Bitcoin blockchain), it is by far the superior mechanism, and on its own is yet another reason to move to a Payment Point enabled Lightning Network. Like using MPPs, using AMPs makes calls to barrier-reveal indistinguishable to the rest of the network from normal AMPs while providing users anonymity when dealing with the Barrier Escrow. However, unlike using MPPs, the Barrier Escrow is literally unable to claim any of the partial payments until all have been set up, meaning that if the Barrier Escrow succeeds its payments, all of our original multiple payments are guaranteed to have succeeded in being set up. Note that this still requires trust that the Barrier Escrow will claim all of its payments but we no longer need trust to ensure that no payment can be claimed until all payments are set up. Additionally, when using High AMP, no trust is required that the correct scalar pre-image will be revealed as we are no longer using hashes and can verify the pre-images’ correctness by simply inspecting the payment point. Because of this property, using High AMPs is the only implementation that enables trustless composition of multiple escrows (by adding their points together)!

---

## Conclusions

We now have three ways of implementing Barrier Escrows, all of which can be used to enable making payments atomic (both on chain and off), though they each have their own trust models. Generally speaking, there seems to be a trade-off between simplicity and trust (where the simpler solutions require more trust). However, once we replace HTLCs with PTLCs on the Lightning Network, using High AMPs to implement Barrier Escrows will become much simpler as we can reuse the infrastructure for constructing AMPs in making calls to barrier-reveal, and once this is done I believe that using AMPs is the clear best candidate for implementing Barrier Escrows in the future.

Now that we can feel more comfortable using Barrier Escrows in our protocols, we should be confident in using them for atomic multi-payment setup as described in our last post. We will describe in more detail how to use multiple payments to realize complex contracts in a future post by using Discreet Log Contracts as a case study. In a future post, we will describe how to use Barrier Escrows to facilitate the atomic transfer or updating of any number of lightning payments, opening the door to off-chain contract transfer and contract updating.