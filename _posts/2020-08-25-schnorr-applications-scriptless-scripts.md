---
title: 'Schnorr Applications: Scriptless Scripts'
author: 'Nadav Kohen'
date: 2020-08-25
permalink: /blog/schnorr-applications-scriptless-scripts/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
  - Adaptor Signatures
  - PTLCs
---

In this post we continue our survey of Schnorr-enabled schemes and their applications to Bitcoin by exploring the exciting world of Scriptless Scripts which are enabled by a signature scheme called [Adaptor Signatures](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#Adaptor_Signatures). I will note that while it is possible to do [adaptor signatures without too much pain in ECDSA](https://github.com/LLFourn/one-time-VES/blob/master/main.pdf) (without Schnorr), it is still much much nicer to do with Schnorr and can be integrated with other Schnorr signature variants.

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Batch Verification](https://web.archive.org/web/20241113021719/https://suredbits.com/schnorr-applications-batch-verification/)
* [Schnorr Threshold Sigantures](https://web.archive.org/web/20241113021719/https://suredbits.com/schnorr-applications-threshold-signatures/)
* [Flexible Round-Optimized Schnorr Threshold – FROST](https://web.archive.org/web/20241113021719/https://suredbits.com/schnorr-applications-frost/)
* [Schnorr Blind Signatures](https://web.archive.org/web/20241113021719/https://suredbits.com/schnorr-applications-blind-signatures/)
* [Taproot Upgrade – Activating Schnorr](https://web.archive.org/web/20241113021719/https://suredbits.com/the-taproot-upgrade/)

---

Andrew Poelstra’s idea of [Scriptless Scripts](https://download.wpsoftware.net/bitcoin/wizardry/mw-slides/2018-05-18-l2/slides.pdf) was largely motivated by MimbleWimble development due to the fact that this context only allowed signatures without any kind of script enforcement which most other blockchains (e.g. Bitcoin) have. As the name suggests, a Scriptless Script is a contract (in the usual blockchain sense of being a programmatic spending condition) enforced by a blockchain which does not actually contain any code which generally means that the signature scheme alone is used to enforce conditions instead.

So far in our exploration of Schnorr signatures, signature schemes have been used almost exclusively for relatively simple validation. The “contract” enforced by a normal Schnorr signature is simply the condition that the owner of a key is the only one who may unlock funds, and one could view MuSig as a slightly more complicated “contract” where some $$n$$-of-$$n$$ parties must cooperate to unlock funds. This is certainly a step towards the goal of enforcing Bitcoin-like contracts using nothing but normal Schnorr signature validation as it covers many `OP_CHECKMULTISIG` use cases.

To motivate further Scriptless Script development, we will begin by considering another common Bitcoin contract: [Hash Time Locked Contracts](https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts) (HTLCs). An HTLC is a contract where funds being unlocked is conditional on and atomic with the payee revealing a secret to the payer. The most popular use of HTLCs is in the Lightning Network where these contracts allow atomic payment routing where Alice can pay Carol through Bob by having Alice set up an HTLC to Bob with a secret only Carol knows so that Bob must set up an HTLC to Carol in order to get this secret and claim his funds. In the current lightning network HTLCs require quite a [bit of scripting](https://github.com/lightningnetwork/lightning-rfc/blob/master/03-transactions.md#offered-htlc-outputs) but it turns out that there is a scriptless version of HTLCs which replaces script in this contract with simple signature validation indistinguishable from normal activity.

---

## Adaptor Signatures

Our goal is to modify the Schnorr signature scheme to “hide a secret” within the signature so that when a payee claims funds, they must reveal this secret to the payer. Let $$t$$ be the payment secret (known to the receiver) and let $$t\cdot G = T$$ be the point/public key associated with this secret (known to both parties). Like in a normal payment, the payer/sender of the funds will generate a Schnorr signature of a transaction sending funds to the receiver. Unlike a normal payment, the sender will tweak their signature using $$T$$ in such a way that the receiver will only be able to repair this signature to get a valid one, by using the secret $$t$$. This generated invalid signature will be sent to the receiver (instead of to the blockchain) who will repair the signature using their secret before broadcasting the transaction using the now valid signature to the blockchain.

Let’s elaborate on exactly what this “tweak” is. We want to generate an **adaptor signature** $$(R', s')$$ such that for some $$R$$ and $$s = s' + t$$, $$(R, s)$$ is a valid Schnorr signature (in the usual way from the [beginning of this series](/blog/introduction-to-schnorr-signatures)). A normal signature is of the form

$$k' + H(X, R', m)\cdot x$$

If we add a tweak $$t$$ to this we can think of $$t$$ as “combining” with the $$k'$$ value

$$(k' + H(X, R', m)\cdot x) + t = (k' + t) + H(X, R', m)\cdot x$$

Let’s call the value $$k = k' + t$$ as this is functionally the $$k$$ value of the repaired signature. However, our repair seems to have broken something else. The above expression is not a valid signature because we still have $$R'$$ in the hash which is not $$k\cdot G = (k' + t)\cdot G = R' + T$$. But this is easy enough to fix, let us just use the value $$R = R' + T$$ in this hash to begin with.

Therefore, an adaptor signature for the message, $$m$$, with key,$$x$$, one-time key $$k'$$, and secret $$t$$ where $$T = t*G$$ is $$(R', s', T)$$ where

$$s' = k' + H(X, R' + T, m)\cdot x$$

Before repairing this tweaked signature (aka completing this adaptor signature), the receiver should first verify that this is a correct adaptor signature by checking that

$$s'\cdot G \stackrel{?}{=} R' + H(X, R' + T, m)\cdot X$$

After which they can use their knowledge of $$t$$ to compute

$$s = s' + t = (k' + t) + H(X, R' + T, m)\cdot x = k + H(X, R, m)\cdot x$$

And finally, the receiver has a valid digital signature $$(R, s)$$ which is in fact indistinguishable from any other random signature to anyone who hasn’t seen the adapted version, $$s'$$, before.

We now know how to create an adaptor signature, verify an adaptor signature, and complete an adaptor signature to get a valid signature. What’s left is for the sender to recover the secret $$t$$ from the completed signature. Since $$s = s' + t$$, this is actually as easy as finding the signature $$s$$ be it on the blockchain or elsewhere, and take the difference between it and the adaptor signature $$s'$$ to get $$t = s - s'$$.

And that’s the full picture:

1. Sender generates an adaptor signature (which only requires knowledge of $$T$$).
2. Receiver verifies this adaptor signature.
3. Receiver completes the adaptor signature using $$t$$, uses this completed signature.
4. Sender takes the difference between the completed and adaptor signatures to learn the secret tweak.

One last note I’d like to make about adaptor signatures is that they have a deniability property. This means that given any valid digital signature $$(R, s)$$ and any scalar $$t$$, anyone can compute valid adaptor signatures $$(R - t\cdot G, s - t, t\cdot G)$$ meaning that no adaptor signature can be proven to have been a precursor to an on-chain signature.

---

## Adaptor Signatures and MuSig

A key feature of adaptor signatures is that they have the exact same structure as normal Schnorr signatures but where we hash the value $$R' + T$$ instead of just $$R'$$. We should thus be relatively convinced that Schnorr adaptor signatures are as [secure (unforgeable) as regular Schnorr signatures](/blog/schnorr-id-protocol)!

Furthermore, since partial signatures from [MuSig](/blog/schnorr-applications-musig) are also so similar to normal Schnorr Signatures, this adaptor scheme can be applied to them as well. For example the CoinSwap application we discussed for MuSig in the [last post](/blog/schnorr-applications-musig) is essentially two separate HTLCs using the same secret. We will now be able to replace these HTLCs with PTLCs using the same scalar: Say that there are two parties with keys $$X$$ and $$Y$$ have a MuSig aggregate key $$a_x\cdot X + a_y\cdot Y$$. Say that the party $$X$$ wishes to send these funds to party $$Y$$ on the condition that they reveal the scalar to the point $$T$$ (which, in this example, will unlock their funds elsewhere). We can mix the MuSig signing scheme with the adaptor signing scheme by having $$X$$’s partial signature be

$$s_x' = k_x + H(a_x\cdot X + a_y\cdot Y, R_x + T, m)\cdot x$$

(Noting the added $$T$$ to the hashed nonce). Upon receiving and verifying $$Y$$’s partial signature $$s_y$$, $$X$$ sends his adapted signature $$s_x'$$ from which $$Y$$ can compute $$s_x = s_x' + t$$ and subsequently $$s = s_x + s_y$$ which is a valid signature for the on-chain aggregate key. And once $$X$$ sees this signature, they can compute $$s - s_y - s_x' = t$$.

---

## Applications

Now that we have constructed Adaptor Signatures, let’s do a brief survey of their applications. We just showed how adaptor signatures can result in CoinSwaps where the two transactions are unlinkable! This is in stark contrast to any attempt at a CoinSwap using HTLCs that require the hashes (which are the same) to appear on-chain linking the two transactions.

We have also already discussed one use case which is a replacement for HTLCs often called PTLCs (Point Time Lock Contracts) which function similarly to HTLCs but where a scalar to a point is revealed rather than a pre-image to a hash. Aside from being more private and moving more of the contract execution off-chain, it turns out that PTLCs have immense benefits to the Lightning Network. So many, in fact that I’ve written two whole blog series on the topic!

* [Payment Points Series 1](https://web.archive.org/web/20241113021719/https://suredbits.com/payment-points-part-1/)
* [Payment Points Series 2](https://web.archive.org/web/20241113021719/https://suredbits.com/payment-points-monotone-access-structures/)

Beyond PTLCs, another improvement to the lightning network can be made through the use of adaptor signatures, namely Unified State Lightning Channels. I wrote a detailed description of this idea in [this post](https://web.archive.org/web/20241113021719/https://suredbits.com/generalized-bitcoin-channels/) but the super high-level idea is to replace the current Lightning revocation mechanism which requires dual symmetric state between the two channel parties (where each side has to_local punishment clauses) to a unified state where it is still possible to detect who publishes an old state based on the signatures used on the transaction. This is done by providing channel counter-parties with adaptor signatures tweaked with secrets only they know, and that secret can then be used to lock the punishment mechanism without the need for dual states!

---

### Discreet Log Contracts

A common tactic for schemes in my PTLC blog series is to construct points which represent more than just a random value (which is what an ordinary Lightning payment uses). I’d like to briefly discuss one such scheme as it pertains to the nice structure of Schnorr signatures. Imagine a scenario where a client wishes to purchase a signature of a message, $$m$$, from a server. A signature is simply a scalar so if we could compute the point/public key associated with this scalar we could set up a PTLC for that point and be assured that the client receives the valid signature if and only if they end up being debited. Recall that all valid schnorr signatures satisfy

$$s_m\cdot G = R + H(X, R, m)\cdot X$$

Thus if the server pre-commits to the nonce $$R$$ that it will use, the client will be able to compute $$R + H(X, R, m)\cdot X$$ without learning any information about $$s$$. It can then use this point equal to $$s_m\cdot G$$ as the adaptor point in a PTLC paying the server. If the server claims these funds by publishing a completed signature, the client will be able to compute $$s_m$$ as the difference between the completed signature and the adaptor signature they gave the server. Otherwise the server will be unable to claim their payment without simultaneously revealing the signature. In other words adaptor signatures enable trustless sale of regular Schnorr signatures (with pre-committed $$R$$ values).

An even more interesting application which uses pay-for-signature as a black box is called a Discreet Log Contract (DLC). We have [written about DLCs extensively](https://web.archive.org/web/20241113021719/https://suredbits.com/category/discreet-log-contracts/) and are working on an [open source specification](https://github.com/discreetlogcontracts/dlcspecs) and [implementation](https://github.com/bitcoin-s/bitcoin-s/tree/adaptor-dlc) of DLCs. In this scheme a signer, often referred to as an oracle, is committed to signing some future data (say, which team won a football game, or what the price of bitcoin is tomorrow morning) and pre-commits to their $$R$$ value for this event’s signature. This means that if it is known what all possible outcomes $$m$$ that could be signed are, then all possible points $$s_m\cdot G$$ can be computed in advance as described above. Two parties that want to enter into a DLC speculating on this future event can construct a funding transaction which will have a MuSig (2-of-2) output whose keys, one from each party, will be used to give adaptor partial signatures to the counterparty for each event. Specifically one transaction is constructed spending the funding transaction for each possible outcome, and so when the oracle does publish a signature for some specific message, either party can complete the adaptor partial signature given to them at contract construction and add their own partial signature to get a valid signature spending the funding transaction with the correct outputs for the outcome! The majority of a DLC’s execution occurs off-chain with the on-chain footprint limited to a single Schnorr signature on-chain, indistinguishable from any other application or normal spend.

---

### Zero Knowledge Contingent Payments

While Schnorr signatures have the beautiful property that their points can be computed from public information (assuming $$R$$ is made public), there is an even wider class of structured data which can be proven to have a given public key in zero knowledge. For example, say that a payer wishes to purchase a hash pre-image known to the payee but they don’t wish to use an HTLC as this would be visible on-chain (among other reasons). The payee could compute the point for their pre-image and provide the payer with a zero knowledge proof that the scalar behind the point they give has the hash output in question. This proof allows the payer to construct a PTLC in which they are guaranteed to learn the hash pre-image should their funds be claimed, without requiring any trust in the payee. It is [already known](https://bitcoincore.org/en/2016/02/26/zero-knowledge-contingent-payments-announcement/) that these payments, called Zero Knowledge Contingent Payments (ZKCPs) are possible in a wide variety of uses using HTLCs, but PTLCs provide a more private and scalable alternative (with some caveat restrictions I won’t discuss here). ZKCPs can be thought of as a generalization of PTLCs (pay-for-scalar) and pay-for-signature (which are just examples of ZKCPs with trivial proofs).

---

### Simple Escrow Contracts

One last application of adaptor signatures I’d like to present here is a simple Escrow contract. Traditionally these contracts appear on the blockchain as a 2-of-3 `OP_CHECKMULTISIG` output where one key belongs to each of two parties, and a third key belongs to the escrow. Should the two parties which have signed a general contract (off-chain) cooperate and agree on what the outcome of their contract should be, they need not consult the escrow and can be the two signers allowing the funds to be unlocked. Should a disagreement arise, however, either party can approach the escrow and whichever side the escrow agrees with will be given the escrow’s signature allowing the funds to be spent without cooperation from the counterparty. As is common with Schnorr, we wish to hide this activity within a single public key on-chain so that no evidence of the existence of any contract is publicly knowable. This can be accomplished by using a 2 key MuSig scheme similar to a CoinSwap but where each party provides adaptor partial signatures for possible outcomes using a secrets known to the escrow as the tweaks (for example these secrets could be signatures of the outcome). In this way if both parties agree, they can execute a normal MuSig signing to spend their funds, otherwise either party can use the escrow to complete a partial signature they have already been given to spend the funds.

This escrow scheme is essentially a DLC where the oracle has been replaced by an escrow, and as such it requires quite a bit of off-chain overhead for the users. In a future post about Schnorr threshold signatures, we will attempt to create a cleaner more expressive escrow scheme using Schnorr signatures.

---

This concludes our discussion of Adaptor Signatures, though if you found these applications interesting I highly encourage you to go read the large number of blog posts I’ve written dedicated to further uses of PTLCs and adaptor signatures! The remainder of this series will explore batch verification, threshold signatures, blind signatures, and Taproot.