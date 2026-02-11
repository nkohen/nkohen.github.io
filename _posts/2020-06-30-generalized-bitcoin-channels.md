---
title: 'Generalized Bitcoin Channels'
author: 'Nadav Kohen'
date: 2020-06-30
permalink: /blog/generalized-bitcoin-channels/
tags:
  - Bitcoin
  - Adaptor Signatures
  - Lightning
---

In this post we will delve into the new ideas brought forward in the paper “Generalized Bitcoin-Compatible Channels” for improving the future Lightning Network.

---

## Paper Takeaways

Let us start by summarizing the higher-level contents of the “Generalized Bitcoin-Compatible Channels” paper. The authors introduce a novel mechanism by which we can create Lightning channels where punishment is applied to the entire channel at once rather than on a per-output basis. This means that should your counter-party try to cheat by publishing an old/revoked state, rather than claiming all channel funds by spending the revocation branch of every single channel output (2 + # of pending payments on this old state), you can instead publish a single simple transaction to claim all funds. Another (arguably even nicer) property of this scheme is that this penalty mechanism does not require a symmetric state setup where both parties have their own commitment transactions, but rather both parties have a unified state with the same (single) commitment transaction!


This unification property makes managing multi-transaction schemes (such as [Discreet Log Contracts](https://web.archive.org/web/20241113005023/https://suredbits.com/discreet-log-contracts-on-lightning-network/)) within Lightning channels simpler as there is no longer any need to keep two versions of every part of the contract and instead, off-chain multi-transaction contracts can be constructed (more or less) exactly how they would be constructed to be put on-chain.

This property of acting like the underlying blockchain is why the authors have named the product of this channel scheme “Generalized Channels”. I am personally not a big fan of this name as it is well-known that Poon-Dryja channels can already support most any output that is supported by the underlying ledger (granted, there is extra complexity in duplicating these outputs and adding penalty logic to them) and I personally prefer to think of these as “Unified Channels”.

The benefits of having a unified commitment transaction are plentiful: the channel’s construction and maintenance becomes simpler, communication becomes smaller and simpler and during disputes in which the commitment transaction ends up being broadcasted to the blockchain, there is a smaller on-chain footprint. Lastly, the only tool that this scheme requires that is not already used in the current Lightning Network is single-signer Adaptor Signatures! This means that we could deploy these channels today as opposed to [eltoo channels](https://blockstream.com/eltoo.pdf) which also have a unified commitment transaction but would require a soft-fork to the underlying Bitcoin blockchain introducing an new signature hash type.

It just so happens that single-signer Adaptor Signatures are also exactly what is needed to support Payment Points (PTLCs) which [we have written about extensively](/tags/#ptlcs) and [we even implemented these signatures and executed an on-chain PTLC](https://youtu.be/w9o4v7Idjno) at a hackathon a couple months ago. The authors of the Generalized Channels paper wrongly claim that the ECDSA adaptor signature scheme is new and that a precise notion of security for adaptor signatures is also new, when in reality both of these things were already proposed by Lloyd Fournier in this [mailing list post](https://lists.linuxfoundation.org/pipermail/lightning-dev/2019-November/002316.html) and this [paper](https://github.com/LLFourn/one-time-VES). That said, the authors do modify one step of the signature scheme in a way which allows them to create a security proof for their signature scheme, which is new! It is not yet known if the scheme as proposed by Lloyd is secure without this modification in general (although it is safe to omit the added step of generating a NIZK proof of knowledge in some contexts, like for DLCs). Note that while the existence of this ECDSA adaptor signature scheme means we can begin work on these unified channels and PTLCs now, Schnorr adaptor signatures are still superior to their ECDSA counterparts and when Schnorr signatures are permitted on-chain everything can be greatly simplified.

One last note about “generalized channels” before we move on to the details: Although I think it would be foolish not to support PTLCs when implementing these channels, HTLCs are also supported by this scheme and furthermore these channels (with HTLCs on them) are fully compatible with existing HTLC Lightning channels so that it is possible for consenting individuals to experiment with “generalized channels” within the existing Lightning Network without any external parties knowing that they are routing through a new kind of channel!

---

## How do Ledger Channels Work?

The goal of any ledger channel scheme is to allow fully-enforceable off-chain transactions to be updated off-chain. This means that there is some funding transaction on-chain which holds the total channel funds in a 2-of-2 multisignature output between the parties, and there is some off-chain transaction, called the commitment transaction, that spends this funding output and outputs each party’s balance (and possibly other things if there are ongoing contracts). Furthermore, there must be some way of creating new off-chain commitment transactions and invalidating old ones which will allow us to update state (without touching the blockchain).

In today’s Lightning channels, this update mechanism is accomplished using the `per_commitment_secret` and dual channel states. Each party has their own version of the commitment transaction where all outputs paid to them (to_local outputs) are time-locked and are given an additional non-time-locked spending condition which allows the other party to spend the output should they know the `per_commitment_secret`. Parties can then revoke old commitment transactions by revealing their `per_commitment_secret` for that state. Hence, if Alice were in a channel with Bob and decided to cheat by publishing a revoked state, Bob would have time (because of the time-lock) to spend all of Alice’s outputs utilizing her `per_commitment_secret`.

At a high level:

1.  the `per_commitment_secret` acts as proof that the state is old/revoked and
2.  the dual commitment transactions (as opposed to having just one) ensures that only the party which publishes an old state can be punished.

“Generalized channels” still have a `per_commitment_secret`, but have only one unified commitment transaction and so this scheme requires a new mechanism for ensuring that only the party which publishes a fraudulent commitment transaction can be punished.

It must first be noted that in a “generalized channel,” the commitment transaction (which spends the on-chain funding transaction) is an intermediate transaction which is then further spent by another state transaction (or “split transaction” as it is called in the paper) containing the channel’s ledger. Instead of having the state outputs (local balance, remote balance, and ongoing contracts), the commitment transaction now has a single output which can be spent by the state transaction after the time-lock, or by either party (immediately) should they be able to prove that their peer both revoked this commitment transaction and published it.


This still leaves the issue of proving that it was the counterparty (and not you) that published an old commitment transaction since both parties now have the same shared commitment transactions. This is accomplished using Adaptor Signatures.

An Adaptor Signature is an invalid signature (in this case, for a transaction) that is invalid in a very specific (and verifiable) way: it has been tweaked using some public key. If one has access to the Adaptor Signature and knows the private key to the public key which was used to tweak this signature, then one can “un-tweak” this invalid signature to create a fully valid signature. If this party were to then use this “completed” (valid) signature however, then the signing party (who only knew the public key tweak), can subtract the completed and adaptor signatures to discover the private key to the public key that was used to tweak the signature. In short, Adaptor Signatures allows for an atomic exchange of a signature for a private key.


Thus, if both parties provide adaptor signatures for commitment transactions to their peers, then the public key tweaks can be used to define the punishment branches for spending the commitment transactions. Specifically, if Alice and Bob are in a channel and Alice decides to publish an old revoked commitment transaction, then Bob will be able to spend this transaction before the time-lock by using both the `per_commitment_secret` that Alice gave to him when she revoked this state, and the adaptor secret (called the publishing secret) that Bob can compute by subtracting the Adaptor Signature he gave to Alice for this commitment transaction from the completed signature Alice used on the commitment transaction when she published it. Furthermore Alice cannot spend the commitment transaction on her punishment branch as she does not know Bob’s publishing secret (because he did not use the adaptor signature given to him).

In short, by using adaptor signatures to sign each other’s commitment transactions, the two parties in a channel can be sure that **if a commitment transaction is published to the blockchain, then only the publishing party’s publishing secret is revealed**. This paired with the usual `per_commitment_secret` being revealed to revoke old states, allows us to once again achieve our Lightning Penalty mechanism in this unified state setting.

If you still have questions or want a nice visual representation of how current Lightning channels’ and “generalized” channels’ commitment transactions function, there are two great diagrams on pages 4 and 5 of [the paper](https://eprint.iacr.org/2020/476.pdf).

To recap, “Generalized Bitcoin-Compatible Channels” offers an improved version of the Poon-Dryja Lightning Penalty scheme where communication overhead is significantly reduced, punishment is constant size (and cost), [and where there is no dual symmetric commitment state allowing for significantly less-complex channels](https://eprint.iacr.org/2020/476.pdf). These unified channels are fully compatible with existing Lightning channels and will create an easy way to experiment with non-traditional (non-HTLC) outputs in Lightning channels. All that is required to construct such channels (other than *a lot* of work) is Adaptor Signatures which are already implemented in a branch of libsecp256k1, and coincide with the requirements for [payment points](/tags/#ptlcs)!