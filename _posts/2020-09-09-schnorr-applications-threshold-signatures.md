---
title: 'Schnorr Applications: Threshold Signatures'
author: 'Nadav Kohen'
date: 2020-09-09
permalink: /blog/schnorr-applications-threshold-signatures/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
  - Threshold Signatures
---

In today’s installment of the Suredbits Schnorr Series, we will begin our exploration of threshold signatures schemes! We will discuss various uses for threshold signatures and then go on to describe three different ways of doing threshold signatures, each with their own pros and cons. The last (and possibly most exciting) threshold signature implementation, FROST, will take a whole blog post to describe, so stay tuned for that post to come next.

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Batch Verification](blog/schnorr-applications-batch-verification)
* [Flexible Round-Optimized Schnorr Threshold – FROST](/blog/schnorr-applications-frost)
* [Schnorr Blind Signatures](/blog/schnorr-applications-blind-signatures/)
* [Taproot Upgrade – Activating Schnorr](https://web.archive.org/web/20241113012850/https://suredbits.com/the-taproot-upgrade/)

---

A threshold signature scheme is a signature scheme involving $$n$$ participants who have a shared key, much like [MuSig](/blog/schnorr-applications-musig/), but where any $$t$$ of them ($$t < n$$) can collaborate to sign for the shared key. We call such a scheme a $$t$$-of-$$n$$ signature scheme (often $$m$$ is used in place of $$t$$ in the context of Bitcoin). Most Bitcoiners will be familiar with this concept and terminology because Bitcoin has a built-in threshold signature scheme OP_CHECKMULTISIGNATURE in the underlying scripting language.

However, using this op-code requires all participants’ public keys to be made public as well as the threshold and, as usual, we wish to hide these aspects of our contracts and have only a single public key and signature appear on-chain. Preferably, the result should be as indistinguishable from a normal single public key spend as possible.

Before we dive into three different ways to achieve this goal, let us first discuss some powerful use cases for threshold signatures.

---

## Use cases

Generally speaking, there are three categories of threshold uses (with somewhat fuzzy boundaries):

1.  Some federation of external entities (hopefully trusted) control the funds.
2.  Some federation of internal entities control the funds.
3.  Some federation of mixed internal and external entities control the funds.

There are many more use cases for threshold schemes than the ones discussed below, but I hope that the following discussion gives the reader a feel for threshold scheme uses and adequately motivates the subsequent sections.

---

### Escrow

The first category could loosely be called escrow use cases. This includes both literal escrows and other kinds of use cases such as side chains.

Threshold signature schemes have always been viewed as the easiest way to improve security and protect against bribery and collusion in any scheme requiring trust. For example, if some group of participants in some contract wish to have their contract enforced by some trusted external entity, they would be better off giving control to some $$t$$-of-$$n$$ entities rather than just to one. This way, the cost of bribery goes up as a malicious party must bribe $$t$$ escrows rather than just one. Furthermore it is useful to have $$t < n$$ because this allows the contract to remain safe, even if some small number of escrow parties become unreachable (e.g. shut down by a government) or uncooperative (e.g. hacked). Escrow-like schemes that could benefit from threshold signatures schemes include [Smart Contracts Unchained](https://zmnscpxj.github.io/bitcoin/unchained.html), [Discreet Log Contracts](/blog/schnorr-applications-scriptless-scripts), and many more.

Another less escrow-like use case that I would loosely put in this category is side chains like Liquid, which require trust in some federation (group of entities with a threshold control-structure) who you send funds to on-chain to receive side-chain tokens off-chain (well, off of Bitcoin’s chain anyway). Funds can then also be withdrawn from the side-chain, assuming that enough of the federation remains trust-worthy and sends you coins.

---

### Key Management

In the opposite direction of escrow use cases lie what could be generally called key management use cases. This is where a single party uses multiple keys to secure their funds. One might wonder what might cause someone to do such a thing and the answer happens to be very similar to why many escrows with a threshold is better than using just one. If you store your funds in a threshold scheme of $$t$$-of-$$n$$ keys (usually 2-of-3 or 3-of-5), then if one (or some) of your keys are compromised or lost, then you don’t lose funds! So long as you still control at least $$t$$ keys. This scheme is particularly powerful when some of the keys are kept extremely secure and in a diverse set of ways. For example, one could use a cold key, a key given to a security company, and three hot keys (one at work, one at home and one on a phone). This 3-of-5 scheme allows the user to spend their funds normally in the case where they have all their hot keys, and should they lose them or if they become compromised, so long as a single hot key remains in the users control they are safe against attack and can move their funds to a safe location.

Key management schemes such as these are also relevant to interactive protocols such as the Lightning Network. In the future, it is expected that Lightning nodes with very large sums of money on the network will not be so insecure as to keep the keys to these funds (which must be online) all in one place, rather threshold schemes like the ones described below will be used to make the funds on Lightning nodes more secure.

---

### Committee Funds

One final kind of use case worth noting is shared funds. For example funds shared between spouses can be put in a “joint account” (although MuSig likely does the trick for most marriages) or a committee in charge of spending funds which requires some quorum $$t$$-of-$$n$$ committee members to authorize spending.

---

## Implementation with MuSig + Taproot

There are three different ways to implement threshold signatures and we’ve already discussed one of them. Back in the [MuSig blog post](/blog/schnorr-applications-musig/), we discussed how Taproot will allow outputs to contain a hidden tree of spending conditions. So for example if we want to have a 2-of-3 output between Alice, Bob and Carol with keys A, B and C but we want this output to look like a single public key spend, we could put in our tree all of the following conditions:

* MuSig(Alice, Bob)
* MuSig(Alice, Carol)
* MuSig(Bob, Carol)

and this output effectively becomes a 2-of-3 threshold output!

The advantages of this scheme is that it is entirely non-interactive, meaning that Alice, Bob and Carol don’t need to exchange messages in order to construct this output. The primary disadvantage of this scheme is that it is distinguishable from ordinary single public key spends as the tree must be revealed. Two minor mitigations for this is that you could have the MuSig key at the root be a 3-of-3 and if all parties agree, then the spending of this output can be made to look like a normal non-contract spend. Alternatively, the most likely of the three cases listed above can be put at the root with the other two cases hidden in the tree, and in the case that the two parties at the root are in agreement, then the spend does not need to reveal that there were other cases.

Another disadvantage of this scheme is that the number of cases that must be added to the tree grows very large in size, especially if the threshold is closer to half of the total number of participants. For example 2-of-3 requires 3 cases, 3-of-5 requires 10, 4-of-7 requires 35, 5-of-9 requires 126 and this sequence actually grows exponentially so that even 13-of-25 requires 5,200,300 cases! This means that a merkle proof that a spending case is included will be around 23 hashes long! Now this may not be an issue for most use cases as presumably the majority of threshold signatures will be used for smaller groups of participants, but if you have a decent sized number of keys involved, this may be an inefficient and non-private way to go.

---

## Implementation with MuSig-DN function + Adaptor Signatures

Another much more recently discovered method of doing threshold signatures in the Escrow use case uses [Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts) along with the heavy machinery from [MuSig-DN](https://eprint.iacr.org/2020/1057), namely the pseudo-random function (PRF) and its corresponding Non-Interactive Zero-Knowledge (NIZK) proof system. Fear not, I don’t plan an going into detail of how these two pieces are used in this blog post, all you need to know is that from these pieces of the MuSig-DN paper we are able to construct a Verifiable Encryption function $$VEnc(x, E)$$ which returns $$x$$ encrypted with the public key $$E$$(so that only the owner of $$E$$ can decrypt this) along with a Zero-Knowledge proof that this encrypted value will indeed decrypt to the private key of $$x \cdot G$$ when decrypted by the owner of $$E$$. Specifically we call this Verifiable Encryption because it is an encryption function where the encrypted value can be verified from public information (public keys) only.

With this function in hand (and its corresponding decryption function $$VDec(VEnc(x, E), e) = x$$), we are able to construct what I call OR Points as described in my blog post about [monotonic access structures in PTLCs](https://web.archive.org/web/20241113012850/https://suredbits.com/payment-points-monotone-access-structures/). Namely that if I want to construct a payment contingent on either point $$A$$ ’s scalar being discovered or point $$B$$ ’s scalar being discovered (a kind of PTLC, for example $$A$$ and $$B$$ could be signature points of an oracle), I can give an adaptor signature point whose adaptor point is some random point $$X$$ where I have encrypted the scalar $$x$$ with the two points as public keys:$$c_1 = VEnc(x, A)$$, $$c_2 = VEnc(x, B)$$ and I have given these two encrypted values to my counter-parties. Then if either $$a$$ or $$b$$ becomes known, then my adaptor signature can be completed by decrypting the corresponding encrypted value to learn $$x$$.

To make things more concrete, consider the simple escrow contract where Alice is willing to pay Bob if he performs a service for her. Both parties trust Erin to be an objective arbiter, but Erin is currently unaware that such a contract is taking place. Alice sends funds to a MuSig outpoint between herself and Bob, and provides Bob with an adaptor signature for a transaction spending the funds to Bob (note that Bob also provides Alice a normal signature on a transaction sending the funds back to Alice after some timeout). The adaptor point on this signature is $$X$$ where Alice generated $$x$$ and verifiably encrypted this value using $$A$$ and $$E$$, where she has given both of these encrypted values to Bob.

Once Bob has performed his service, he goes to Alice and asks to be paid. If Alice is satisfied, she reveals $$a$$ to Bob who can then decrypt and use $$x$$ to complete his adaptor signature and claim the payment. Otherwise, Bob can appeal to Erin who can either decide to side with Alice, or side with Bob and give him the value $$e$$ which he can use to decrypt the other encrypted value and claim his funds like before.

This scheme does not require interaction during setup with the Escrow entities, but does require more interaction than MuSig + Taproot between participants. Another disadvantage of this scheme is that it only supports one-way payments, but this is not as bad as it may seem as multiple parties can just atomically set up multiple one-way payments in different directions to overcome this limitation. The main benefit of this scheme (aside from being Lightning Network compatible) is that the resulting on-chain transactions always look like normal single public key spends with no need for further Taproot magic!

To read more about this scheme in detail check out [this gist](https://gist.github.com/jonasnick/d413c80ad18f2d775a75316e7c3c797b) by Jonas Nick.

We now have some ideas of how to use threshold signature schemes as well as two different ways of implementing threshold addresses, but there’s even more to discuss. In the next post of this series we'll be diving into FROST, the Flexible Round-Optimized Schnorr Threshold scheme! You can think of this as the extension of MuSig to threshold signatures, but more on that in the next post, stay tuned.