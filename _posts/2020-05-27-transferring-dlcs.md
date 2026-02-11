---
title: 'Transferring Discreet Log Contracts'
author: 'Nadav Kohen'
date: 2020-05-27
permalink: /blog/transferring-dlcs/
tags:
  - Bitcoin
  - DLCs
---

We’ve been discussing Discreet Log Contracts (DLCs) and their implementation a lot in our last couple posts and this week I’d like to take a step back and discuss some new theoretical discoveries regarding DLCs that we’ve made about transferring in and out of DLC positions.

This post is going to discuss a novel method by which we can safely transfer ownership of contracts such as DLCs with a single on-chain transaction and without any fancy scripts.

Before we can dive into transfers, I will first summarize what part of a DLCs structure is important to know, and hopefully make more precise what I mean in the previous paragraph by “contracts such as DLCs”. A DLC has a **funding transaction** which spends users’ unspent transaction outputs to a single output called the **funding output**. Once this funding transaction is built (but not yet signed), an arbitrary number of off-chain transactions called **contract execution transactions** (CETs) are built and signed. These CETs spend the funding output and each CET outputs a different possible contract outcome. CET signatures (from your counterparty) are saved to ensure that either party has the ability to unilaterally execute the contract should any CET become valid (CETs usually have timelocks or require signatures). Only once all CETs have been signed is it safe for funding transaction signatures to be generated and used to publish the funding transaction on chain. To dig further into the mechanics of how Discreet Log Contracts work, see our [previous post](/blog/how-dlcs-work) on the topic.

While I did have DLCs in mind when writing the above description, this method of constructing multi-transaction Bitcoin contracts is a common way of executing non-trivial multi-party contracts in Bitcoin, and since the structure of having a funding output spent by CETs is the only part of DLCs considered or used in the transfer mechanism I am about to describe, this transfer mechanism will apply more broadly to any multi-transaction contract which has the structure of using a funding transaction and spending transactions (CETs).

Lastly, before I dive right into how we actually go about transferring contracts like Discreet Log Contracts, I’d like to give some motivation for why this functionality is important. DLCs can be used to create speculative contracts on anything that an oracle exists for. But in today’s financial markets, it is uncommon for such speculative financial products to be illiquid. Traders don’t necessarily want to commit to some futures contract without the option of selling that contract (at a gain, or at a loss) to a third party. Companies that we’ve discussed DLCs with often point to this as the primary reason they are not open to using DLCs as they exist today (and rightfully so). Hence, the development of a safe transfer mechanism allows DLC participants (and possibly other kinds of contract participants) to treat their contracts in a way  much closer to the way in which they treat traditional financial contracts that are traded on derivatives exchanges.

Now to the transfer mechanism! Consider a simple situation in which Alice and Bob have an existing Discreet Log Contract speculating on the price of Bitcoin (in USD terms) which expires in 10 days, where Alice walks away with $$1\text{BTC}$$ if the price is over $$\$10\text{K}$$ and Bob gets $$1\text{BTC}$$ otherwise. Each party initially funded $$0.5\text{BTC}$$ into this contract and they now have a funding transaction confirmed on-chain with signed CETs off-chain. Let’s say that Satoshi claims some of their old coins causing the market to panic and plummet. Bob wants out of this DLC if he can exit at a profit, because he wants to use his coins currently stuck as collateral to go open some reckless lightning channels. A third party, Carol, is interested in paying Bob $$0.1\text{BTC}$$ for his DLC position.

Alice, Bob and Carol collaboratively construct a **transfer transaction** which spends Alice and Bob’s current funding output as well as Carol’s funding utxos, and outputs Alice and Carol’s new funding output, as well as an output to each Alice, Bob and Carol (each when applicable). In our example, there should be an output to Bob of $$0.6\text{BTC}$$ since he is being refunded his collateral in the DLC ($$0.5\text{BTC}$$) as well as receiving a payment from Carol ($$0.1\text{BTC}$$) for his position. In our example, there will not be any payment to Carol, but if Bob were to be transferring at a loss, some of his collateral would be given to Carol in an output of the transfer transaction (or they could save space by altering the new DLC between Alice and Carol’s output values, but for simplicity’s sake these details are omitted). Lastly a small fee is paid to Alice on a transfer transaction output for cooperating with the transfer.

Once the transfer transaction is built, Alice and Carol can use this new funding output to construct their new DLC’s CETs and sign them, and once this is done all parties can sign the transfer transaction and it can be published. When this is done, Alice and Carol will have a new DLC, Alice will have been paid a small transfer fee, and Bob will have all of his funds back plus a payment from Carol for his DLC position, which was our goal!

In this protocol as stated above, Alice takes no risk: if the transfer transaction gets confirmed, she ends up with the same DLC position having gained some small amount, and if the transfer transaction does not end up on chain then she is in the same position as she was at the start.

Carol also takes no risk: if the transfer transaction gets confirmed then she gets her desired DLC position, and if the transfer transaction does not end up on chain then she has the same experience as a botched DLC setup and she pays Bob no premium.

If the transfer transaction gets confirmed then Bob is happy as he gets his premium and collateral back. However, if exectued as stated above, Bob can end up with a problematic state if the transfer transaction is not confirmed once he has signed it. This is because Carol (who could be working with Alice) ends up with a free option if she (or Alice) holds on to the transfer transaction and waits to see what the outcome will be. If right before contract maturity it is clear that the outcome will be Alice winning, then the transfer transaction does not get published and Alice takes her winnings. If instead Bob’s position is a winning one, Carol can now publish the transfer transaction and get those winnings at only a $$0.1\text{BTC}$$ loss. Hence, this scheme is not actually safe for Bob quite yet.

Note that the above free option attack does not affect Carol as she can simply spend any of her funding inputs to invalidate the transfer transaction after some timeout (which she can choose).

Luckily, there is a relatively simple fix for the above problem that will make the transfer process safe for Bob. We introduce a **transfer cancel transaction** which Alice and Bob will sign before constructing the transfer transaction and which spends their current funding output to a new funding output on which they construct the same DLC that they currently have. The transfer cancel transaction (which has one input and one output) is given a time lock whose timeout is equal to the time they are willing to wait for the transfer transaction to end up on chain (should be just a few blocks).

Now it is safe for Bob to sign the transfer transaction as described previously because in the case where that transaction is not confirmed, he can simply publish the transfer cancel transaction and try a transfer again with some other party.

One last note on this transfer process is that it is safe for all parties involved to attempt multiple transfers concurrently (say with two different third parties Carol and Dave) because only one can be valid in the end as they all spend the same input.

This transfer mechanism is summarized in the following diagram:


![A DLC transfer.](/images/blog/DLCTransfer.png)

As promised, we’ve described a safe mechanism for transferring ownership of funding-CET style contracts like DLCs with a single on-chain transaction and without any fancy scripts!

Stay tuned for more Discreet Log Contract content here on our blog. We plan to release a demonstration of a simple DLC transfer as described above in the coming weeks.