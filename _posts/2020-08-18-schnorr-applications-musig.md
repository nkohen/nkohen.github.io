---
title: 'Schnorr Applications: MuSig'
author: 'Nadav Kohen'
date: 2020-08-18
permalink: /blog/schnorr-applications-musig/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
  - MuSig
---

Welcome to this week’s installment of the introductory Schnorr blog series! So far we have covered (in extreme depth) what Schnorr signatures are and why they work securely. If you didn’t follow or haven’t read the [last two posts](/blog/schnorr-id-protocol) (detailing Schnorr’s security) you will still be able to read this post (and the remainder of this series) so long as you felt comfortable with the very [first post](/blog/introduction-to-schnorr-signatures) in this series or have a good understanding of how Schnorr signatures work. In this post, we shall begin our exploration of variants of Schnorr signatures which enable countless application use cases, starting with MuSig.

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Batch Verification](blog/schnorr-applications-batch-verification)
* [Schnorr Threshold Signatures](/blog/schnorr-applications-threshold-signatures)
* [Flexible Round-Optimized Schnorr Threshold – FROST](https://web.archive.org/web/20241113021719/https://suredbits.com/schnorr-applications-frost/)
* [Schnorr Blind Signatures](https://web.archive.org/web/20241113021719/https://suredbits.com/schnorr-applications-blind-signatures/)
* [Taproot Upgrade – Activating Schnorr](https://web.archive.org/web/20241113021719/https://suredbits.com/the-taproot-upgrade/)

---

## What is a Multi-Signature?

MuSig is a Schnorr multi-signature scheme proposed by Maxwell, Poelstra, Seurin, and Wuille in [this paper](https://eprint.iacr.org/2018/068.pdf). A multi-signature scheme, as the name suggests, entails a set of multiple signing keys ($$X_1, X_2, \dots, X_n$$) which all collaboratively generate a signature for a message. Given any normal signature scheme (such as Schnorr or ECDSA), the easiest multi-signature scheme simply concatenates each signer’s individual normal signature of a given message: $$s = (s_1, s_2, \dots, s_n)$$. This scheme is already supported in Bitcoin using the operation OP_CHECKMULTISIG (OP_CMS for short). In fact, OP_CMS actually supports more than just multi-signatures as you can create an address which is spendable by a threshold of $$m$$-of-$$n$$ participants where $$m$$ can be less than $$n$$ but we will save discussion of threshold signature schemes for a later post in this series, and today we will only consider the $$n$$-of-$$n$$ case.

While OP_CHECKMULTISIG certainly functions as a correct multi-signature scheme, it comes with some serious drawbacks. $$n$$-of-$$n$$ multi-signatures are $$n$$ times the size of regular signatures as it requires putting $$n$$ signature and public key pairs on-chain. Likewise, this takes longer to verify than single signatures. Lastly, they have no privacy features in that all participants are publicly known since all $$n$$ keys must be used for verification.

MuSig aims to right all of these wrongs by being a Schnorr multi-signature scheme which, no matter the number of signing parties, produces a single signature indistinguishable from ordinary Schnorr signatures. Thus, the verification of MuSig signatures is exactly the same as ordinary Schnorr. Additionally, it enables **key aggregation** so that individual signing keys can remain private. Specifically, if you have $$n$$ signers, $$X_1, X_2, \dots, X_n$$, and some message, $$m$$, that they wish to collaboratively sign, using MuSig they can generate a single Schnorr signature, $$(R, s)$$, which will be a valid signature of $$m$$ using aggregate key $$X = \text{agg}(X_1, X_2, \dots, X_n)$$ so that in any public space (like a blockchain) these $$n$$ parties can pretend to be just one party with key $$X$$. In short, we can make multi-signature outputs look indistinguishable from standard outputs.

To make the benefits of this scheme even more explicit, note that aside from the obvious privacy afforded to signers using MuSig, this is also a huge scalability win for blockchains. Uses of OP_CMS (and similar schemes) take up a fair amount of blockchain space as well as verification processing power, and MuSig allows these uses to be replaced with small, easy-to-verify single-key spends.

---

## Applications

Before discussing the math behind MuSig, let’s first dig into some current and future use cases of multi-signatures in Bitcoin!

One of our favorite use case of multi-signatures here at Suredbits has probably got to be Lightning Network channels, whose usual on-chain footprints currently look something like this:



It is important to note that the A’s and B’s in this diagram represent that a public key belongs to Alice or Bob but not that the either party re-uses the same key three times and rather both parties use three distinct keys. With MuSig, this picture simplifies by replacing the 2-of-2 in the funding transaction with a single public key, making a lightning channel indistinguishable from UTXO consolidation followed by a payment with change (among many other protocols that will be in this anonymity set). In particular, Lightning Network outputs will be indistinguishable from common single-user wallet addresses!

Another common 2-of-2 multi-signature use case is for 2FA wallets such as Blockstream’s [Green Wallet](https://blockstream.com/green/) where one key is held by the user, and another is held by a server which enforces two-factor authentication (note that the user can also unilaterally spend after a given time-lock so that they still own their funds). A current user of Green Wallet has on-chain addresses that are easily distinguishable from a user of most other wallets. But with MuSig, secure wallets like these will have normal single-pubkey addresses.

More generally speaking, one could imagine there being many applications which function like 2FA wallets by having an $$n$$-of-$$n$$ cooperative spending branch and a fallback spending condition with some weaker $$m$$-of-$$n$$ requirement. This insight is one of the key motivations for the Taproot proposal coming to Bitcoin in … two weeks? … and while I won’t go into many details about Taproot here (check out [this workshop](https://bitcoinops.org/en/schorr-taproot-workshop/) if you’re interested), I would like to touch on some higher-level details as they pertain to multi-signatures. In particular, every Taproot address has a built-in $$n$$-of-$$n$$ cooperative spending condition where, if all parties involved in some output agree on how funds should be spent, they can spend their funds using MuSig in such a way that no one looking at the blockchain would ever know that there was a contract as opposed to a simple single public key spend. This is HUGE! It means that in any protocol, if parties are cooperating, then ALL activity will be indistinguishable from single-party transactions. Is it a lightning channel? Discreet Log Contract? 2FA wallet output? Liquid side-chain related transaction? Escrow Contract? Etc. etc.? Nobody can know! All of them look the same as me sending a friend some sats (with fees to match).

One last privacy benefit in Bitcoin I’d like to mention before discussing the details of MuSig is a protocol known as CoinSwap. A CoinSwap is when two parties, say Alice and Bob, make an atomic exchange of funds to increase the privacy and fungibility of their outputs. Specifically, both parties move funds into a 2-of-2 multi-signature output after setting up a contract which guarantees that if Alice’s output is spent by Bob, a secret number will be leaked to Alice which she needs to spend Bob’s output. If you are interested in more details see [this gist](https://gist.github.com/chris-belcher/9144bd57a91c194e332fb5ca371d0964). An important feature to notice is that Alice and Bob (without anyone else’s permission or help) can pay each other cooperatively (with knowledge that they are safe and won’t lose funds if the other defects) where their transactions are not only un-linkable and independent-looking, but the actual on-chain footprint simply looks like Alice paid to some ordinary-looking key, which paid to some other ordinary-looking key which in reality belongs to Bob (and vice versa from Bob to Alice). For further discussion on the unique privacy benefits of CoinSwaps check out [waxwing’s post](https://joinmarket.me/blog/blog/coinswaps/) on the topic and for discussion of a well-designed implementation, check out [succinct atomic swaps](https://gist.github.com/RubenSomsen/8853a66a64825716f51b409be528355f).

Additionally, note that even if you never plan on using any of the above schemes, MuSig will still benefit everyone’s use of the blockchain as others will be taking up less space. This section has very much been an *incomplete* list of protocols improved through the use of MuSig. Frankly, there are just so many things that can be done on top of Bitcoin and so many of them enjoy privacy and scalability benefits when MuSig is allowed. So rather than spending the rest of eternity going through all of them I have instead decided to just give you a taste above and I think we are now ready to get our hands dirty and see how all of the above (and more) can be achieved.

---

## How does MuSig Work?

The key idea that enables MuSig for Schnorr signatures is **Linearity,** which we briefly discussed in the [introductory post](https://suredbits.com/introduction-to-schnorr-signatures/) of this series. We want some way to take $$n$$ parties where each party has their own public key and we want to aggregate their keys into a single public key that the parties can collaboratively sign for (functionally like an $$n$$-of-$$n$$ OP_CMS). Naïvely, if we have a set of signing keys ($$X_1, X_2, \dots, X_n$$), we could let the aggregate key be

$$X = X_1 + X_2 + \dots + X_n$$

(where you should recall that public keys are points which can be added together to get new points). Now if we want to generate a signature for this shared key, we are going to have every party generate their own partial signature so that in the end, we should be able to add all partial signatures together like we did when discussing linearity in the first blog post to get a valid signature for the aggregate key. For a message, $$m$$, we let each party generate and share a partial nonce ($$R_1, R_2, \dots, R_n$$) (defining aggregate nonce $$R = R_1 + R_2 + \dots + R_n$$) and then each party can compute their partial signature

$$s_i = k_i + H(X, R, m) \cdot x_i$$

So that the aggregate signature is

$$s = s_1 + s_2 + \dots + s_n = (k_1 + \dots + k_n) + H(X, R, m) \cdot (x_1 + \dots + x_n)$$

$$= k + H(X, R, m) \cdot x$$

where $$k$$ and $$x$$ are the aggregate one-time-use private key and signing private key respectively. This multi-signature scheme generates a valid (regular) Schnorr signature $$(R, s)$$ of the message $$m$$ with the key $$X$$. Sadly this scheme is vulnerable to what is called Rogue Key Attack.

Say that I convinced some other people to do this protocol with me and we each had our public keys, mine being $$X_1$$, I could lie and tell all of the other participants that my public key was actually $$X_1' = X_1 - X_2 - \dots - X_n$$ which is not actually a key I know the private key to. Then our aggregate key used on-chain would become $$X = X_1' + X_2 + \dots + X_n = X_1$$ which I do know the private key to! As such I could then unilaterally send those funds anywhere I wanted without the need for any cooperation. If you were able to get me to prove that I knew the private key to the public key I claimed was mine, this would stop my Rogue Key Attack but then I could do the same attack on the nonce values to gain control of the aggregate one-time-use private key $$k$$. This may not seem as bad but the moment we try to sign as a group, I will wait until I see everyone else’s partial signatures so that I can compute the aggregate signature $$s = k + H(X, R, m) \cdot x$$ which would allow me to compute $$x$$ and once again I would be able to send all of the funds anywhere I wanted without cooperation.

As such, in order to fix the above scheme, we need to make both the aggregate nonce value, $$R$$, and the aggregate public key, $$X$$, secure against Rogue Key Attacks. For our nonce values, one way to do this is to have all parties publicly commit to a partial nonce $$R_i$$ before revealing any of these values (this way no one can use knowledge of other partial nonces when computing their own partial nonce). Specifically we will require that every party broadcast the hash of their chosen nonce, $$t_i = H(R_i)$$, and only reveal the nonce $$R_i$$ once they have seen every other party’s commitment $$t_i$$.

This mitigates the attack against our nonce, but it is an impractical solution for our aggregate signing key $$X$$ because public keys are oftentimes already public and re-usable so that the above scheme may not protect us. Instead we can try to change our aggregate key to be computed using a hash of all signing public keys, similar to how we added the nonce to our signing hash in the introductory blog post. Specifically we let $$<L>$$ be some encoding of the set of all public keys ($$X_1, X_2, \dots, X_n$$) and then let

$$a_i = H(<L> || X_i)$$

and

$$X = a_1 \cdot X_1 + a_2 \cdot X_2 + \dots + a_n \cdot X_n$$

so that it is now hard to compute some $$X_1'$$ from ($$X_1, X_2, \dots, X_n$$) such that $$X = X_1$$. This throws off the math a little bit since the sum of our partial signatures which yields ($$x_1 + \dots + x_n$$) as the coefficient on our signing hash no longer gives us $$x$$, the private key to $$X$$. Luckily, there is an easy tweak to our partial signatures that fixes this; let

$$s_i = k_i + H(X, R, m) \cdot a_i \cdot x_i$$

so that we reclaim our nice aggregate signature

$$s = s_1 + s_2 + \dots + s_n = (k_1 + \dots + k_n) + H(X, R, m) \cdot (a_1 \cdot x_1 + \dots + a_n \cdot x_n)$$

$$= k + H(X, R, m) \cdot x$$

To recap, MuSig signing consists of three rounds:

1.  All parties send commitments, $$t_i$$
2.  All parties reveal nonces, $$R_i$$ and all parties verify that $$t_i = H(R_i)$$
3.  All parties compute and send their partial signatures $$s_i$$

And at this point any party who has seen all nonces and partial signatures can compute and use the (normal) Schnorr signature $$(R, s)$$.

This is the MuSig proposal proved secure in [this paper](https://eprint.iacr.org/2018/068.pdf), but many people are unsatisfied with the 3 round-trip communication requirement and a lot of work has been put into shaving off an interactive round to make a version of MuSig with only 2 rounds. See this [blog post by Jonas Nick](https://medium.com/blockstream/insecure-shortcuts-in-musig-2ad0d38a97da) for reasons why various shortcuts that could turn the 3 round-trip protocol into a 2 round-trip protocol are insecure.

I am happy to report that this is indeed possible to do! For context on this solution, another issue with the above MuSig protocol is that unlike normal Schnorr signatures (such as the variant defined in [BIP 340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#default-signing)), it is not safe to naïvely generate nonces deterministically by hashing the context. This is because an attacker could try to do a MuSig signing with you, get a partial signature, then fail the execution by not giving you their partial signature. They could then try again on the same message but using a different nonce value of their own this time. Since other parties’ nonces are not part of the context which one can use to generate their own nonces (due to the commitment phase), hashing the context will yield the same nonce but a different partial signature because the aggregate nonce is different! As such, when the attacker learns your second partial signature, they will have received two signatures from you with a re-used nonce and can compute your private key. Therefore, real randomness or persistent state must be available and secure to the signer when generating one-time-use private keys.

It turns out that there may be a paper published soon which has a way to safely compute deterministic nonces, and doing so will also get rid of the first round of communication! In this variant of MuSig, all parties are required to generate deterministic nonces and provide (NIZK) proof that they have done so according to the rules. Thus what was our second round becomes our first and includes not only a broadcast of each party’s nonce but also a proof that it was computed correctly. The details of how this nonce is computed and proven to be correct are allegedly very cool and I hope to write a separate blog post about this someday (after the paper that may or may not exist is published).

Disclaimer: Absolutely nothing in this blog post is my original idea.

In this post we have introduced multi-signatures and a Schnorr-specific multi-signature scheme called MuSig (and alluded to another variant). We also spent some time looking at the vast applications of MuSig to Bitcoin and the various improvements to both privacy and scalability of Bitcoin funds and contracts. Stay tuned for next week’s post where I will be diving into my personal favorite variant of Schnorr signatures which are called Adaptor Signatures!