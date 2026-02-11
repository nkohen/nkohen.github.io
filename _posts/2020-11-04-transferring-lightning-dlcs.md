---
title: 'Transferring In-Channel Lightning DLCs'
author: 'Nadav Kohen'
date: 2020-05-27
permalink: /blog/transferring-lightning-dlcs/
tags:
  - Bitcoin
  - DLCs
  - Lightning
---

Transferability of Discreet Log Contracts (DLCs) is of major interest due to the capital inefficiency inherent to contracts which do not rely on custody or counter-party trust. In other words, DLCs require all parties to lock up the maximum collateral that they could lose. This means that if a party wishes to exit their exposure to the DLC outcome, they must either further collateralize themselves by locking up more funds or they can attempt to transfer out of their position by finding themselves a replacement hence unlocking collateral. We have previously discussed how to execute [on-chain transfers](/blog/transferring-dlcs) and [transfers of PTLC-based routed DLCs](https://web.archive.org/web/20241204181353/https://suredbits.com/transferring-lightning-dlcs/) using barrier escrows. In this post we describe a mechanism to transfer [in-channel DLC outputs](https://web.archive.org/web/20241204181353/https://suredbits.com/discreet-log-contracts-on-lightning-network/) to adjacent channels using HTLCs. Note that the scheme detailed in this post can be used more generally to transfer any generic two-party contract output to an adjacent channel.

In this blog post, we are not committed to any specific Lightning channel architecture. In fact, the two channels involved could feature different architectures and still complete a transfer between them. It is worth noting that no change is needed to Bitcoin code in order to support in-channel DLCs and their transfers, though considerable Lightning node work is required. To help make things a bit more concrete for readers unfamiliar with embedding DLC outputs in Lightning channels, I recommend reading [this previous post](https://web.archive.org/web/20241204181353/https://suredbits.com/discreet-log-contracts-on-lightning-network/) which has a section devoted to such channels as well as [this paper](https://github.com/p2pderivatives/offchain-dlc-paper/blob/master/offchaindlc.pdf) for an alternative architecture that yields more practical results (but requires more changes to Lightning nodes).

We describe a Lightning DLC transfer where Alice and Bob have a channel containing a DLC output which Bob wishes to transfer to Carol. This scheme requires that Alice and Carol must already have an open channel (perhaps Alice is a market maker) with sufficient unused capacity on both sides to fund the DLC output that will be transferred to that channel. We assume that Bob wishes to exit the DLC and Carol wishes to enter in his place and is willing to lock up the necessary funds for a small time period to facilitate a transfer.

Once Alice, Bob, and Carol have agreed to and initiated the transfer, it is executed in three stages: Transaction Construction, Signing, and Execution. At a high level, both channels add transfer outputs which enforce hash time lock contracts (HTLCs) where the hash locks enforce a DLC on one channel and a refund on the other, while the time locks enforce the inverse outcomes as is illustrated in the following diagram provided by [Ichiro Kuwahara](https://twitter.com/1_LOW_0219):

![Transfer Diagram](/images/blog/transfer-diagram.png)

Note that this diagram is not the full picture, as it doesn't have penalty outputs, this is just a high-level conceptual diagram. To get the complete picture as detailed below, one of the Transfer Failure Transactions (depending on which of Bob or Carol generated the hash) must have a Transfer Penalty Transaction spending the output to HTLC outputs where either one party in the channel gets all funds or the other party does. In the case that Carol is the hash generator then this HTLC output can be put in place of Carol's output on the Transfer Failure Transaction rather than introducing a new transaction. The purpose of this penalty mechanism is to ensure that either both transfers reach success transactions or both reach failure transactions.

---

## Transaction Construction

1.  Bob or Carol (doesn’t generally matter who) generates a hash to be used in all HTLCs described below.
    * Just like regular lightning payments, the hash generator’s timeout in HTLCs must be smaller than the other party’s HTLCs.
2.  Alice and Bob construct a Transfer Transaction which spends their DLC funding output (wherever it is) and has an HTLC output called the Transfer Output.
3.  Alice and Bob construct a Transfer Success Transaction which spends the hash-locked branch of the Transfer Output and which refunds the collateral that each Alice and Bob had originally put into this DLC.
4.  Alice and Bob construct a Transfer Failed Transaction which spends the time-locked branch of the Transfer Output and which outputs a new DLC funding output.
    * If Bob is the hash generator, then they must add a new Transfer Penalty Transaction that spends this new DLC funding output and outputs an HTLC output where Alice gets all funds on revealing the hash pre-image and Bob gets all funds otherwise. The timeout on this penalty HTLC should be Carol’s HTLC timeout plus some time to get on-chain.
5.  Alice and Bob construct an identical DLC to their original (minus transaction fees) using the output of the Transfer Failed transaction as a funding output.
6.  Alice and Carol add an (HTLC) Transfer Output to their channel whose value is equal to the total collateral of this DLC. This is done either by adding it to their commitment transaction or by adding an output to their [split transaction](https://github.com/p2pderivatives/offchain-dlc-paper/blob/master/offchaindlc.pdf) and then construct a Transfer Transaction which has spends the split transaction output to the Transfer Output.
7.  Alice and Carol construct a Transfer Success Transaction which spends the hash locked branch of the Transfer Output and outputs a DLC funding output.
8.  Alice and Carol construct a Transfer Failure Transaction which spends the time locked branch of the Transfer Output and outputs the collateral that Alice and Carol funded into the Transfer Output.
    * If Carol is the hash generator, then rather than getting her funds back, an HTLC output is constructed instead where Carol gets her funds back on the timeout branch but Alice gets these funds should she reveal the hash pre-image. The timeout on this penalty HTLC should be Bob’s HTLC timeout plus some time to get on-chain.
9.  Alice and Carol construct a DLC identical to Alice and Bob’s original DLC (minus transaction fees) using the output of the Transfer Success transaction as a funding output.

---

## Signing

1.  All DLC Contract Execution Transactions (CETs) and the Transfer Penalty Transaction (if one exists) must be signed before signing the transactions which contain the DLC funding outputs.
2.  All Transfer Success and Transfer Failure transactions must be signed before signing the transaction which contains the Transfer Output.
3.  Alice should not sign the transaction containing the Transfer Output on the channel where her counter-party knows the hash pre-image until she has received a signature for the transaction containing the Transfer Output from the other channel.
    * This ensures that the Bob and Carol cannot force a state where the hash generator’s transfer transaction succeeds while the other party fails.
4.  Alice should not sign her Transfer Transaction with Bob until Carol has revoked her previous channel state (committing her to the Transfer Output).
    * This ensures that Bob and Carol cannot force a state where the transfer succeeds for Bob and Carol publishes her old commitment transaction.
5.  In the case where Carol is the hash generator, this means that Alice must wait until both Bob has signed the Transfer Transaction before she provides Carol signatures for adding the Transfer Output and then she must wait for Carol to irrevocably commit to the Transfer Output before giving Bob her signature of the Transfer Transaction.

The following order for the signing of Transfer Transactions will always be safe (regardless of hash generator):

1.  Bob and Carol sign (in either order).
2.  Alice revokes her old commitment transaction with Carol.
3.  Alice signs the Transfer Transaction with Carol.
4.  Carol revokes her old commitment transaction.
5.  Alice signs for Bob.

---

## Possible Executions

### Happy Path Execution

This execution is very similar to the happy path execution for a normal Lightning payment but where the result is a refund of a DLC output between Alice and Bob and a new DLC output on the channel between Alice and Carol.

* The party that generated the hash (Bob or Carol) will reveal the hash pre-image to Alice and they cooperatively replace their
    * DLC Output if Bob generated the hash
    * Transfer Output if Carol generated the hash

with the outputs of their Transfer Successes transaction.

* Alice then reveals this hash pre-image to the party that did not generate the hash (Carol or Bob) and they cooperatively replace their
    * DLC Output if Bob did not generate the hash
    * Transfer Output if Carol did not generate the hash

with the outputs of their Transfer Successes transaction.

### Timeout Execution

The transfer can timeout if the party that generated the hash goes offline or is for some other reason silent for too long. In this case transfer failure becomes the state in both channels  either through cooperative update or on-chain execution. The result is things go back to how they were before with a DLC output on Alice and Bob's channel and no such output on Alice and Carol's channel.

### Penalty Execution

The following is what happens if Bob and Carol collude and attempt to cheat Alice:

1.  The party that generated the hash (Bob or Carol) does not reveal the hash pre-image to Alice. They instead wait until their Transfer Output times out and execute a transfer failure.
2.  They then collude with the other party (Carol or Bob) by giving them the hash pre-image which they use to execute a Transfer Success in their channel with Alice.
3.  Alice then uses this revealed hash pre-image to punish the party that generated the hash (Bob or Carol) through the penalty HTLC, claiming all of that counter-party's collateral.

In this execution the Penalty Transaction is used to punish the hash generator should they reveal the hash directly to Alice's other counter-party and not through Alice. In the case that Bob generated the hash, the result is that Alice now has a DLC in her channel with Carol and she takes all of Bob's (as well as her own) collateral which was previously used for their DLC. In the case that Carol generated the hash, the result is that Alice's DLC with Bob is refunded but Alice takes all of Carol's (as well as her own) collateral which would have ben used for their DLC. In either case, Alice unilaterally takes funds from the cheating party.

### The Weird Execution

There is one weird possible execution path which Alice can choose to pursue but has full control to avoid:

* The party that generated the hash (Bob or Carol) will reveal the hash pre-image to Alice and they cooperatively replace their
    * DLC Output if Bob generated the hash
    * Transfer Output if Carol generated the hash

with the outputs of their Transfer Successes transaction.

* Alice does not reveal the hash pre-image to the party that did not generate the hash (Carol or Bob) leading to a timeout and subsequent transfer failure on that channel.

This is the only non-penalized execution path where one channel reaches the Transfer Success state while the other channel reaches Transfer Failure. In the case that Bob generated the hash, this case corresponds to Alice allowing Bob to refund his DLC in their channel while not pursuing a new DLC with Carol, allowing that transfer to refund. In the case that Carol generated the hash, this case corresponds to Alice opening a new DLC between her and Carol, while refusing to close her DLC with Bob so that she now has a DLC in both channels.

This is weird behavior as Alice would be better off communicating directly with Bob that she agrees to refund his DLC, or else directly with Carol to open a new DLC that has nothing to do with a transfer. Nevertheless, it is safe behavior as neither Bob nor Carol can distinguish this case from a normal Success or Failure which they are okay with. Furthermore Alice need not worry about being forced into this execution as she can simply choose the Happy Path Execution instead in the second step. Lastly, it should be noted that this is not a reliable mechanism for Alice to try and trick one of her counter-parties as this plan falls apart and turns into the Happy Path Execution should the hash generator communicate the hash pre-image to Alice's other counter-party directly after executing a Transfer Success in their channel.

---

## Adding a Premium Between Bob and Carol

In this section we present an adjustment to the above transfer scheme which results in an equally good transfer scheme where the transfer is made atomic with a payment between Bob and Carol corresponding to a premium to compensate for the appreciation/depreciation of the DLC position being transferred. The adjustment is as follows:

* The party being paid the premium must generate the hash in the first step of Transaction Construction.
* Before the hash pre-image is revealed the payer (Bob/Carol) sets up a normal lightning payment to the payee (Carol/Bob) for the transfer payment amount routing through Alice and using the same hash as all other HTLCs (which was generated by the payee).
* During execution, hash pre-image reveals are also accompanied by removing the payment HTLC in the usual (`update_fulfill_htlc`) way.

Note that under this adjustment, the Weird Execution results in Alice paying the hash generator in place of her other counter-party, and all parties are still happy!

---

## Analysis

Now that the scheme is fully specified and we've discussed various execution paths and named them, let us analyze all possible executions and argue that they are "safe". Safety is defined here as any execution where no party has been unilaterally forced into a position they are unhappy with under the assumption that Bob wishes to exit the DLC and Carol wishes to enter in his place and is willing to lock up the necessary funds for a small time period to facilitate the transfer. Note that transfer failure is acceptable to both Bob and Carol, but a mix of one failure and one success might be unacceptable to Alice.

1.  In the case where the hash generating party does not reveal the hash pre-image to anyone, the Timeout Execution occurs.
2.  In the case where the hash generating party somehow reveals the hash pre-image to Alice's other counter-party (and does not reveal to Alice), then either
    * That party does not reveal the hash pre-image and this results in a timeout execution.
    * That party forces the Transfer Success transition to occur, in which case the hash generating party either
        * Managed to execute a Transfer Failure, in which case Alice has a penalty HTLC which she can use to steal all of the hash generating party’s funds resulting in a Penalty Execution.
        * Alice has the option to use the hash pre-image to execute the Transfer Success in her channel with the hash generator (resulting in either a Happy Path or Weird Execution).
3.  In the case where the hash generating party reveals the hash pre-image to Alice, executing the Transfer Success branch on that channel, Alice can either
    * Use the hash pre-image to execute the Transfer Success branch on her other channel, resulting in a Happy Path Execution.
    * Not reveal the hash pre-image on her other channel causing the other party to experience a Transfer Failure indistinguishable from the case in which the hash generating party never revealed the hash pre-image to anyone. This does not lead to any unsafe executions as Alice is the only party at risk of being unsafe and cannot be forced into this (weird) execution path without her consent.
        * Note that the non-hash-generating party does not have a penalty HTLC.

All of the above possible executions are safe except for the Penalty Execution because:

* Under our assumptions, both Bob and Carol are okay with (specifically they are either happy or neutral towards) either outcome: Transfer Success or Transfer Failure.
    * This even holds true under the payment-for-transfer adjustment.
* Alice is okay with any of the above outcomes as there is never a situation where one transfer succeeds while the other must fail. That is, she can always unilaterally cause a channel to reach Transfer Success if her other transfer succeeds, unless her counter-parties collude as is detailed in the Penalty Execution in which case she makes money equivalent or better than the best-case outcome of her DLC and is happy.

Lastly, note that the Penalty Execution cannot happen unless the hash-generating party reveals the hash pre-image directly to Alice’s other counterparty. They have nothing to gain by doing so. Therefore this scheme remains safe as no rational actor would do such a collusion.

---

## Conclusion

In this post we have described in detail a mechanism for transferring in-channel Lightning DLCs between adjacent channels and argued that it is safe. Furthermore, we claim that this mechanism can be adjusted to allow for the transfer of arbitrary outputs between adjacent general channels. These transfers can even be linked together to create routed transfers, however we do note that for DLC outputs this routing of transfers does not make sense as there is no situation where one would want to move a DLC funding output from one channel to another channel more than a hop away such that neither party of the original DLC is involved in the resulting DLC. And thus, we now know how to execute DLC transfers in all settings where DLCs are known to be possible.

Stay tuned for more Discreet Log Contract content here on our blog!