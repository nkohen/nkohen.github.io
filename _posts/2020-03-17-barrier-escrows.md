---
title: 'Payment Points: Barrier Escrows'
author: 'Nadav Kohen'
date: 2020-03-17
permalink: /blog/barrier-escrows/
tags:
  - Bitcoin
  - PTLCs
  - Adaptor Signatures
  - Lightning
---

In the previous post in our Payment Points series, we discussed the large class of contracts that can be created on a PTLC-based Lightning Network using [monotonic access structures](/blog/monotone-access-structures). In this post, we want to further develop the idea that general contracts that can be created through the use of Payment Points by defining Barrier Escrows which allow us to do atomic multi-payment setup.

## Extended Payment Points Series:

* [Payment Points Part 1: Replacing HTCLs](/blog/replacing-htlcs)
* [Payment Points Part 2: “Stuckless” Payments](/blog/stuckless-payments)
* [Payment Points Part 3: Escrow Contracts](/blog/escrow-contracts)
* [Payment Points Part 4: Selling Signatures](/blog/selling-signatures)
* [Monotone Access Structures](/blog/monotone-access-structures)
* [Implementing Barrier Escrows](/blog/implementing-barrier-escrows)
* [Transferring and Updating Contracts](/blog/updating-and-transferring-lightning-payments)

---

In our exploration of Payment Points, every scheme has relied on a single lightning payment along with some special point construction. While this is very powerful and even allows us to create [monotonic access structures](/blog/monotone-access-structures), including making escrow and oracle contracts over lighting, we have remained constrained to *only* doing these contracts in single, one-way payments.

The goal of this post is to introduce a viable mechanism for parallel linked payments. More specifically, we must solve the problem of synchronizing when dealing with multiple lightning payments.

Synchronization is the problem at hand because the only thing stopping us from simply setting up multiple payments with special payment points is that one payment will inevitably set up first. Once this happens, there is no incentive for the payee (of the setup payment) to initiate their payment as they can now unilaterally enforce their side of the contract and stand nothing to gain by setting up their payment. Thus, this naive approach would require counter-party trust.

To make things a little more concrete, let us consider two existing proposals for multi-payment contracts on Lightning. The first is a solution to the Lightning Network’s Free Option Problem which was proposed by ZmnSCPxj [here.](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-October/002214.html)

The Free Option Problem (on the Lightning Network) can be understood through the following example:

Alice holds Bitcoin on the Lightning Network and wishes to make a payment to Carol, who has a Litecoin Lightning channel. This route must go through some node, Bob, who receives Bitcoin in one channel, and pays out Litecoin on another channel. We call Bob the exchange node on this route/for this payment. In order to facilitate such multi-asset routed payments Bob must denominate his Litecoin in satoshis, meaning that he must have a declared exchange rate at the time of the routed payment.

At first glance, this seems like a fine setup which allows Alice to spend Bitcoin while Carol collects Litecoin, but there’s a catch. What if Carol is actually just Alice running two nodes? Or in the even simpler case, what if Alice is connected to Bob directly with two channels, one in Bitcoin and one in Litecoin, and she pays herself through Bob (who is essentially acting as a normal exchange in this situation). In this case, Alice can set up an exchange payment (using Bob) to herself, and then just hold onto that payment without completing. Alice will then wait to see if there is any price fluctuation in the BTC/LTC trading pair and complete the payment only if the price moves in her favor.

To make the problem clearer, Alice could set up two payments to herself in opposite directions, one from BTC to LTC, the other from LTC to BTC. This time, either way the price moves, Alice can complete the favorable transaction and fail the other one, resulting in her having more of whichever asset has become more valuable. This “attack” is free to Alice who is guaranteed to profit, and costly to Bob (the exchange node) who is essentially giving Alice free option contracts on the BTC/LTC trading pair. This problem is solved in the same way as any free option problem is solved: put a premium on the option so that it is no longer free.

This can be accomplished by requiring that if a payment from Alice to Carol through Bob, an exchange node, is setup, then a fee payment must also be made to Bob whether Carol succeeds her payment from Alice or not.

A second example which I brought to the lightning-dev mailing list [here](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-October/002213.html) is setting up multiple [payments contingent on oracle signatures](/blog/selling-signatures) between many parties as a way to implement routed and arbitrary multi-party [Discreet Log Contracts](https://adiabat.github.io/dlc.pdf) (DLCs) over a PTLC-enabled Lightning Network.

The simplest instance of this would entail two parties, Alice and Bob, who wish to speculate on some event which has a binary outcome, e.g. whether the price of BTC is OVER or UNDER 10k at the end of tomorrow, where Alice is betting that their oracle will sign the message OVER and Bob bets they will sign UNDER.

Alice will set up a payment to Bob with the point B+S_UNDER where B is Bob’s point and S_UNDER is the point for the oracle’s signature of the message UNDER. Bob will set up a payment to Alice with the point A+S_OVER. If the oracle were to sign the message UNDER, then Bob would be able to complete his payment (and Alice would have to fail hers). Otherwise if OVER is signed then Alice can claim her payment (and Bob would have to fail his). Again, the problem here is that during setup, there is no guarantee for Alice that being cooperative and setting up a payment to Bob will mean that Bob has set up a payment to her (and vice versa) and so there is no incentive for either party to cooperate.

With these two examples in mind, we now search for a solution to the problem of atomic multi-payment setup. We begin by noting that in parallel computing systems, the problem of synchronizing multiple threads in a similar fashion to what we require is accomplished by a construct called a [barrier](https://en.wikipedia.org/wiki/Barrier_(computer_science)). We can solve this problem by moving trust during multi-payment setup from counter-parties and place this trust with some more trustworthy third party. ZmnSCPxj dubbed this third party synchronizing party a Barrier Escrow. We will describe what kind of trust is required further in our next blog post. The Barrier Escrow has a pretty simple interface depicted in the following figure:

![Depiction of a barrier escrow's functionality.](/images/blog/BarrierEscrow.png)

The interface consists of two kinds of calls; barrier-commit in which Alice and Bob send both of their commitment points and receive the same point E in response. These points are not reusable and once the Barrier Escrow sees a point, say A, it should reject any request which contains A and any point but B. This is how Alice and Bob can be assured that they must both reveal in order to get the pre-image to E. This rejection ensures that both Alice and Bob can both *independently* contact the Barrier Escrow with their agreed upon values and receive the point E, or a rejection if their counterparty is being malicious.

This brings us to the second part to the interface, barrier-reveal, which requires both Alice and Bob to reveal their pre-images, and only once they have both done so will the Barrier Escrow respond to either of them, and it responds to both of them with the same pre-image to E, e. Note that this can be extended to an arbitrary number of parties by adding user commitment points.

An important note to consider when thinking about the privacy concerns surrounding Barrier Escrows is that they have many use cases, both on and off chain, and they are also not protocol specific (they can be used for many chains). In the future I expect Barrier Escrows to have many different uses providing their users with a large anonymity set where the Barrier Escrow has no way to distinguish between use cases (the only information it gets is how many parties are involved, which is easy to spoof by adding unnecessary points).

That diagram uses the terms commitment and reveal to mean point and scalar (Barrier Escrows have uses for today’s world using hashes and pre-images as well, which is why the diagram uses those terms).

Alice and Bob can use the Barrier Escrow using the following protocol:

1.  Alice and Bob each generate a (new) scalar and share their points with each other
2.  Alice and Bob each (separately) approach the Barrier Escrow and input both points, getting the same point, E, in return which they should verify
3.  Alice and Bob now execute whatever normal setup their payments require, with the added step of adding the point E to both of their resulting payment points
4.  Once each party receives their payment setup, they again contact the Barrier Escrow, this time by revealing their scalar from step 1
5.  Only when all parties have reached step 4 does the Barrier Escrow respond to Alice and Bob, revealing the scalar to the point E to them

Note that there is no risk in setting up payments in step 3 now since no party knows the pre-image to E and hence neither party can claim each other’s payments, this is what enables us to setup multiple payments and be assured that all parties become fully set up (meaning set up with the scalar to E revealed) before any party can claim any payments. Even better, the above 5 steps are easily extended to an arbitrary number of parties and payments, all by using the single point E to synchronize!

It should now be clear that if we can implement a Barrier Escrow such as outlined, we should be able to achieve atomic arbitrary multi-payment setup. This solves the free option problem (pay-for-payment-setup) as well as enabling routed off-chain multi-party DLCs.

So how shall we go about implementing such Barrier Escrows? Stay tuned next week for a post discussing the implementations of Barrier Escrows, and their trust models.