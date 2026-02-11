---
title: 'Payment Points Part 2: "Stuckless" Payments'
author: 'Nadav Kohen'
date: 2019-08-14
permalink: /blog/stuckless-payments/
tags:
  - Bitcoin
  - PTLCs
  - Adaptor Signatures
  - Lightning
---

In our previous [post](/blog/replacing-htlcs), we discussed how using pre-images and payment hashes to make lightning payments atomic results in the possibility of payment correlation and vulnerability to wormhole attacks. We also discussed how replacing pre-images and payment hashes with scalars and payment points allows us to have payment de-correlation, solving the problems with payment hashes. In this blog post we will discuss one of a few of the exciting new features that can exist in a Lightning Network based on payment points!

## Payment Points Series:

* [Payment Points Part 1: Replacing HTCLs](/blog/replacing-htlcs)
* [Payment Points Part 3: Escrow Contracts](/blog/escrow-contracts)
* [Payment Points Part 4: Selling Signatures](/blog/selling-signatures)

---

In the current state of the Lightning Network, payments can get "stuck" while being setup.  This can result in funds being locked up in HTLCs until the payment times out (which could take quite a while). There are many reasons that a payment can get stuck in this way. Notably, a malicious node could hold your payment hostage at no personal cost (other than forgoing the fee they could be paid for the use of their channel). Even if there was a way to unstick payments during setup, there is also the less serious problem of payments getting stuck during settlement. In this case the payment recipient gets paid but the payer does not receive their Proof of Payment (PoP).

Hiroki Gondo posted a [proposal](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-June/002029.html) for Stuckless Payments to the lightning-dev mailing list a couple months ago that provides a solution to both of these problems by adding a round of communication during payment between setup and settlement called the update phase.

Say Alice is paying Carol as in the diagram below. Rather than sending the sum of Alice’s random numbers to Carol in the onion during setup (recall that this sum is required to begin the settlement of this payment route), Carol instead sends an ACK to Alice when she receives the Point Timelock Contract (PTLC) indicating that the payment did not get stuck on setup. Only after receiving an ACK is the setup done at which point update can begin where Alice sends the sum to Carol, to which Carol responds with the proof of payment because she has now been functionally paid. Finally, settlement follows as usual.

![Visualization of Alice routing through Bob to Carol using a stuckless payment.](/images/blog/StucklessPaymentPoint.png)

This solves the problem of payments getting stuck during settlement since Alice receives the PoP before settlement even begins.

But how does this scheme solve our problem of payment getting stuck during setup? Stuck payments are now safe to retry.

Not only can Alice now retry her payment to Carol along a new route, but she can even start by attempting both payments in parallel! Since Alice does not give Carol the information that she needs to settle the payment until the update phase, Alice can safely setup multiple payments with Carol knowing only one of them will go through. This is because Alice must initiate the update phase, meaning that Carol cannot go right ahead and settle all of the payments Alice has setup, like she would have been able to in the current version of LN. Thus, if any one payment Alice attempts is successfully setup, then the payment can be completed with all of the other attempts failing.

Notice that Bob does not behave any differently here than he does in a normal lightning payment. Thus, this scheme does not require all nodes to support it, only the end nodes in each payment (and perhaps any nodes that might be needed to route the ACK and update messages).

Another important note is that although a similar scheme can be done with payment hashes and pre-images, this would require Alice to know the pre-image of the payment hash from the beginning and so there would be no PoP. PoP is very important, not only because application layer code depends on it, but also because it can be used to make payments atomic with other actions, such as [information decryption](/blog/paid-apis).

This “Stuckless” Payments proposal is one of many proposals out there that rely on a Payment Point based Lightning Network. In our next post, we will continue this series by discussing another application: Escrow Contracts over Lightning!