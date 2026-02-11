---
title: 'Schnorr Series Summary'
author: 'Nadav Kohen'
date: 2020-10-06
permalink: /blog/schnorr-series-summary/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
---

Y’all asked for a high-level, no math, summary of the Schnorr Signature Series and so here you are! If this piques your interest and you are willing/excited to learn some math, check out the series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Batch Verification](blog/schnorr-applications-batch-verification)
* [Schnorr Threshold Signatures](/blog/schnorr-applications-threshold-signatures)
* [Flexible Round-Optimized Schnorr Threshold – FROST](/blog/schnorr-applications-frost)
* [Schnorr Blind Signatures](/blog/schnorr-applications-blind-signatures/)
* [Taproot Upgrade – Activating Schnorr](/blog/taproot-upgrade)

---

## What is Public Key Cryptography?

Now I know I promised no math, and I plan to stand by that, but it would be impossible to talk about Schnorr Digital Signatures without an understanding of some crypto-basics. If you feel you already know the fundamentals of public and private keys, feel free to skip ahead to the next section. In a public key cryptosystem like Bitcoin, entities have private keys which are secrets only they know, and every private key has a corresponding public key which, as the name suggests, can be public knowledge.

The key (hehe) idea is that it is easy to compute a public key from a private key, but extremely hard — functionally impossible — to go the reverse direction of computing a private key from a public key. We call this a **one-way** process with a **trapdoor**. (For readers who know what hash functions like SHA256 are, they are examples of one-way functions which do not have trapdoors).

Another phrasing of this is that public-key cryptography relies on the existence of hard computational problems that become easy if you have some extra secret information, usually information known only to the person who created the problem. A classic example of such a hard problem is factoring large numbers (sorry if this counts as math): really hard for normal computers to do, unless you know some of the factors already in which case you only have to factor a much smaller number. Bitcoin does not use this problem, it instead uses what is called the Discrete Log Problem (DLOG) on an Elliptic Curve. It is not important to know what this problem is to understand this post, but if you are interested [check this out](https://hackernoon.com/what-is-the-math-behind-elliptic-curve-cryptography-f61b25253da3).

---

## What is a Digital Signature?

Well what good are private and public keys? What can we do with them? One common answer is that public-key cryptography enables encrypted communication between strangers (so long as they know each other’s public keys) by having encryption functions which only require public keys and decryption functions which require private keys, meaning that anyone can encrypt a message for anyone else (including strangers) but only the person for whom the message was intended can decrypt. Our focus in this post however, is related to another clear use of public keys: Identity.

Intuitively many people think of public keys as a form of identity for the entity which knows the private key. But there is a problem presented by this intuition: how can I prove to someone else that I know a private key without revealing that secret!? Additional cryptography is needed, which brings us to the concept of a digital signature.

A digital signature is a **proof** that an entity with a specific private key commits to a specific message which leaks absolutely no useful information about that private key (such a proof is often called a Zero Knowledge Proof or ZKP).

If I am attempting to prove to you that I, Nadav Kohen, own the private key for a public key, P, you know, I could sign the message “Nadav Kohen owns P” using my private key, and like the fantasy idealized version of normal written signatures, my digital signature should convince you that the private key behind P was used to generate the signature of this message.

The existence of digital signature schemes is what allows us to think of public keys as identities in a useful way.

---

## How Does Bitcoin Use Digital Signatures?

The Bitcoin blockchain acts as a decentralized ledger keeping track of who has what coins. Specifically it assigns bitcoin amounts to public keys. If I own some bitcoin, that means that one or more public keys which I have the private keys to are assigned some value on the ledger.

If I want to send some of my bitcoin to you, you would provide me with a public key of yours, and I would create a transaction which spends from one of my public keys to yours. This transaction is essentially the message “PublicKey_Nadav’s coins are being sent to PublicKey_Reader”. I then sign this message using the private key behind the public key currently holding my coins and I broadcast this signed message to everyone I know, and they broadcast it to everyone they know, and so on until the message has propagated to the entire Bitcoin network. Once this has happened (and this message has been included in a block), the ledger is considered updated and my public key no longer holds those coins while yours does.

In short, updates to the Bitcoin blockchain are called transactions and consist of a message telling which coins are being spent and who they now belong to, along with signatures of this message by all keys who’s coins are being spent.

Therefore, all that is needed to construct a blockchain is a public key scheme, and a digital signature scheme (as well as a hash function for mining, internet communication … and like … a million other things out of the scope of this blog post).

---

## Bitcoin Signatures Today

As of the writing of this blog post, the only digital signature scheme supported by Bitcoin is an algorithm called ECDSA which is short for Elliptic Curve Digital Signature Algorithm. This scheme has 32 byte private keys, 33 byte public keys, 71 byte signatures and that is about all that I want to say about ECDSA.

A much much better algorithm called the Schnorr Digital Signature Algorithm exists and is better in every way! It has 32 byte private and public keys, and 64 byte signatures so that’s already off to a good start. But what really sets Schnorr signatures apart is their simplicity and structure.

Of note, Schnorr signatures are provably secure (under standard Bitcoin assumptions) which is not true of ECDSA. This means that there is an argument (laid out [in the blog series](/blog/schnorr-id-protocol/)) that if someone could forge Schnorr signatures, then they must also be able to break the underlying hard problem of Bitcoin cryptography.

Speculatively speaking, the reason that Satoshi (creator of Bitcoin) decided to use ECDSA instead of Schnorr was due to the fact that for a long time, Schnorr signatures were patented so that all well-tested open source libraries at the time supported ECDSA and not Schnorr. But it’s been a decade since then and it’s about time Bitcoin shifted over to using a better digital signature algorithm! More on this near the end of this post.

Beyond provable security (under minimal assumptions), small size and simplicity, Schnorr signatures are also structured in a nice way enabling the schemes in the following sections. One last note that I’d like to make before describing these schemes is that while it is true that ECDSA can essentially do all of the things Schnorr signatures can, it is simply not possible without significant overhead and the additional use of complex Zero Knowledge Proofs. In other words, [music note symbols] everything ECDSA can do Schnorr can do better!

---

## MuSig

Schnorr signatures are easily composable. By this I mean that if you add two signatures of the same message together, you can get a valid Schnorr signature of that message which looks like it was signed by the public key equal to the sum of the two public keys of the original signers.

For example, if a friend of mine and I wanted to put some bitcoin in a shared place (like a [Lightning channel](https://web.archive.org/web/20241113012850/https://suredbits.com/lightning-101-what-is-the-lightning-network/) or a [Discreet Log Contract](/blog/what-is-a-dlc)) today, we would have to use two public keys (one for each of us) and spending this bitcoin would require a signature from each of us. With Schnorr signatures however, we could add our two public keys together to get a single “shared” public key and send bitcoin to that! Then when we want to spend this bitcoin, we could each sign (off-chain) a transaction and then add our signatures together to get a valid signature for our shared public key.

This allows for increased privacy as multiple people owning and using bitcoin (be that multiple people in a business or multiple business with a shared fund, or some entirely different reason) is indistinguishable from the “normal” single person use-case.

Essentially, signature aggregation means that we can do key-aggregation allowing for public entities to secretly be composed of multiple entities (without having to reveal this fact publicly).

In addition to the privacy bonus of key aggregation, there are also blockchain space and fee savings as only one public key and one signature is used in place of many.

---

## Threshold Signatures

This composability with Schnorr can be taken even further to the realm of thresholds. This means that not only can we aggregate many keys into a single key (aka n-of-n), but we can do so in a way that only some subset of the keys are needed to sign for the aggregate key (aka m-of-n).

This means that we can make shared ownership more nuanced. For example a friend and I could put bitcoin in a key which is cooperatively owned by three parties: me, my friend and an escrow service, and this can be done in a way where only two parties are needed for signing. This means that me and my friend can either agree on how the bitcoin should be spent, or else either of us can go to the escrow service and spend the bitcoin with its help (in case of disagreement, the escrow acts as a mediator).

This can be done on the Bitcoin blockchain today using an operation code called OP_CHECKMULTISIG but with Schnorr signatures, this can be done with a single public key and a single signature, where all parties not involved cannot distinguish between this public key and signature and a public key or signature belonging to just one person!

As with MuSig, this leads to awesome privacy gains as well as blockchain space and fee savings.

---

## Scriptless Scripts/Adaptor Signatures

Perhaps the most exciting (according to me) application of Schnorr signatures is a scheme called Adaptor Signatures, also termed Scriptless Scripts by Andrew Poelstra. This enables Bitcoin contracts without any public footprint (no scripts)!

An adaptor signature is a special kind of digital signature which is partially encrypted. Specifically, the signature creator chooses a public key (called an adaptor point) to adapt/tweak their signature in such a way that the result can be verified, despite the tweak, using adaptor verification rules but not on-chain Schnorr rules. Upon receiving and validating an adaptor signature it can be un-tweaked to get a Schnorr signature, which will be recognized on-chain as valid, by revealing the private key of the adaptor point to the signature creator.

In other words, an adaptor signature scheme can be thought of as an atomic swap (meaning both sides get what they want or neither do) of a signature for a private key.

There are tons of ways of using adaptor signatures, all consisting of clever choices of the adaptor point public key used to tweak a signature. For example, say that Alice wishes to buy a private key from Bob. She can provide him with an adaptor signature of a transaction sending Bob bitcoin and using the adaptor point to be the public key of the private key she wishes to purchase. Now when Bob un-tweaks her signature to claim her payment to him, Alice learns the private key which she has paid for.

My favorite idea is to use an adaptor point corresponding to an oracle’s signature of a real-world event, so that until a signature is broadcasted the adaptor signature cannot be decrypted which enables us to create (using only signatures) Bitcoin payments and contracts contingent on real-world events, these are called [Discreet Log Contracts or DLCs](/blog/what-is-a-dlc).

Another one of my favorite uses of adaptor signatures is that they enable Point Time Lock Contracts (PTLCs) which are Bitcoin payments that are contingent on a (one-time use) private key being revealed to claim funds, this being the point-lock. Otherwise the funds are claimed after some timeout by the sending party, this being the time-lock. The Lightning Network currently uses a slightly different contract HTLCs which don’t use adaptor signatures, but PTLCs are to HTLCs much like Schnorr is to ECDSA (they are better, in like all the ways). If you want to learn more about PTLCs and all the cool things you can do with them, check out this entirely separate [series devoted entirely to PTLCs](/blog/replacing-htlcs).

---

## Blind Signatures

One last cool Schnorr variant is called a blind signature scheme. In this setting, there is a client and a signing server, the server is blind to what they are signing and the signature they generate can be “unblinded” by the client to result in a signature of a message where both the public key and the message are foreign/unknown to the server but the public key can be proven to correspond to the server.

This is one of the more conceptually complicated variants and it is useful in situations where clients wish to stay anonymous from a server but they require signatures.

The best example use-case that Schnorr blind signatures enable is called Partially Blind CoinSwaps, where there is a server which has many bitcoins and which provides a privacy enhancing service for clients by swapping coins. That is, you send the server some bitcoins and it sends you back a nearly equal amount (minus some fee) of completely unrelated bitcoins. The problem with this scheme as stated is that you have no privacy from the server as they are aware of all of the swaps and can continue to follow your funds. This is remedied through the use of blind signatures so that the server blind-signs its outgoing transaction to the client, thereby becoming unable to tell which incoming transactions correspond to which outgoing transactions!

---

## Activation Through Taproot

The final topic I would like to cover is how Bitcoin is going to be adopting these amazing Schnorr signatures.

This will be done through a soft-fork upgrade known as the Taproot Upgrade (which introduces a new SegWit version). In addition to allowing bitcoins to be assigned to Schnorr public keys and spent with Schnorr digital signatures, the Taproot Upgrade also includes a couple other cool features increasing privacy and fungibility while decreasing block space inefficiency and fees.

At a high level, Taproot introduces a new kind of script validation which only requires Bitcoin users to reveal the spending condition they are satisfying in the case where there are multiple ways that a bitcoin can be spent; for example we could construct a bitcoin address which either me or my partner can unilaterally spend from, but today this spending would require leaking the information that these bitcoins could also be spent by my partner’s public key. Under Taproot this is no longer the case as only the spending condition used must be revealed.

Additionally Taproot introduces a new spending condition to every script that can be thought of as the “everybody agrees” condition which is indistinguishable (due to key aggregation) from a single key spend. This means that in Taproot there is no distinguishing between coins assigned to public keys and coins assigned to complicated scripts unless the complicated scripts are envoked due to non-cooperation between involved parties, and even then only a single spending condition is revealed!

Lastly, all Taproot key spends and scripts use the Schnorr digital signature scheme instead of ECDSA!

To read more about how Taproot will actually be activated in the Bitcoin network, check out [this blog post by Ben](https://web.archive.org/web/20241113012850/https://suredbits.com/activating-taproot/) on that topic.

---

And this concludes the high-level version of most things covered by the Schnorr Signature Series! I highly encourage you to check out the detailed, [math-ridden blog series](/blog/introduction-to-schnorr-signatures/) if you are interested.