---
title: 'Schnorr Applications: Blind Signatures'
author: 'Nadav Kohen'
date: 2020-09-15
permalink: /blog/schnorr-applications-blind-signatures/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
  - Blind Signatures
---

In this post we will be discussing one final Schnorr scheme: Blind Signatures. As their name suggests, a Schnorr Blind Signature is a signature where the signer does not know what they have signed. It may be hard to imagine what this could be useful for but it turns out to be a great tool when dealing with “oblivious” servers, which I think have a large role to play in the future of Bitcoin and the internet at large.

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Batch Verification](blog/schnorr-applications-batch-verification)
* [Schnorr Threshold Signatures](/blog/schnorr-applications-threshold-signatures)
* [Flexible Round-Optimized Schnorr Threshold – FROST](/blog/schnorr-applications-frost)
* [Taproot Upgrade – Activating Schnorr](/blog/taproot-upgrade)

---

Blind signatures schemes have four steps:

1.  The signer presents a nonce
2.  The receiver presents a blind challenge constructed using the nonce (which reveals no information about what is being signed)
3.  The signer provides a normal schnorr signature of this challenge using the nonce from step 1
4.  The receiver unblinds this signature resulting in a normal, valid Schnorr signature which looks completely unrelated to the signature provided by the signer in that both the $$R$$ and $$s$$ values are tweaked by random numbers.

I will go into the mathematical details of this scheme at the end of this post.

When I said an oblivious server above, I meant one which is supporting some trusted computation or data storage, likely getting paid for its service, but remains oblivious of all information that it doesn’t need to know to operate. This kind of information includes things like the identities of users, which parties are interacting with each other, what data is being stored, what the computation it is performing means and other such things. An oblivious server should be a reliable computing service that does nothing else.

[Oblivious Transfer](https://en.wikipedia.org/wiki/Oblivious_transfer) is an example cryptographic building block to making an oblivious server which stores data for users, but in this post I’d like to focus on Blind Signatures which are a key building block for computational oblivious servers.

---

## Simple Token Server

This simplest example of this kind of server is a token server whose sole purpose is to issue tokens and enforce that tokens are not double-spent. A token in this scheme is just the pair (serial_number, server_signature(serial_number)) with a catch, the server signs the serial_number blindly so that users can remain anonymous, even from the server which cannot recognize any token as being associated with any previous interaction. In this scheme the serial_number is the public-facing token and the server_signature enforces ownership. Note that, assuming you share the nonce of the signature, giving a zero knowledge proof of knowledge of server_signature(serial_number) can be done by simply using the [Schnorr ID protocol](/blog/schnorr-id-protocol/) or its corresponding non-interactive signature scheme.

If one wishes to transfer a token, they need only reveal the server_signature(serial_number). The receiving party must then execute a reissuance protocol with the server (anonymously) in which they generate a new_serial_number, show their token, (serial_number, server_signature(serial_number)), to the server along with a blind challenge of new_serial_number. The server checks its database to ensure that serial_number has never been spent before, and if this is the case it adds serial_number to its database and signs the blind challenge. Lastly, the receiver unblinds the challenge to discover server_signatures(new_serial_number) which means that they are now the sole owner of this token and they can consider the payment complete. If the sender of this token attempts to send the token again, or claim it for themselves via reissuance, then this attempt will fail as the server will recognize serial_number as an already spent token.

While this is a nice simple example of an oblivious server using blind signatures to know nothing more than what is needed to enforce the no-double-spending rule for its users, this isn’t a particularly practical scheme as the tokens are just random numbers which isn’t very useful.

---

## Interesting Token (aka Brand Credential) Server

Making the above scheme more interesting require two changes:

1.  Users must be able to buy tokens without trusting other users
2.  Tokens must encode useful information (such as amounts for “fungible” tokens and properties for other tokens such as digital cats)

It just so happens that both of these problems can be solved using the same mechanism, Pedersen multi-commitments. These are commitments to multiple values of the form

$$a_1 \cdot G_1 + a_2 \cdot G_2 + \dots + a_n \cdot G_n + r \cdot G$$

Where the $$a_i$$ are the attributes being committed to and $$r$$ is just a random number. Because of their nice structure, these multi-commitments allow relatively simple zero-knowledge proofs about individual attributes or their relationships. For example, if amount is attribute 1 then one can prove (without revealing any other information) that two tokens have the same amount (and other attributes that must remain constant) during the new reissuance protocol.

As a simple example, you could imagine tokens now being of the form (locktime, type, amount, serial_number, server_signature) and the reissuance protocol now consists of revealing a token to the server and the server validating it hasn’t already been spent as before (using the serial_number), but now the client can present multiple blind challenges (blinded tokens) along with zero knowledge proofs that the sum of amounts hasn’t changed (amongst other properties) and receives signatures on each of these tokens from the server if validation passes and there is no double-spend.

This solves our second problem of having tokens encode useful information, but how do we execute purchases of such tokens without counter-party trust? We add another possible kind of reissuance where a client can go to the server and ask for multiple tokens in exchange but which have the same serial_number (meaning only one will ultimately be spent) and different locktimes (usually zero for the buyer of the token and some large enough number for the seller).

For example, a seller of a token could take a token (type_normal, amount, serial_number, server_signature) and reissue it with the server to two tokens: the buyer token, (type_buyer, buyer_secret, seller_secret, amount, new_serial_number, server_signature), and the seller token (type_seller, locktime, amount, new_serial_number, server_signature) with the same serial numbers. The seller could then give the buyer token to the buyer but withholding the seller_secret, as well as proving to the buyer that the seller token has an adequately large locktime.

At this point the buyer can buy the seller_secret using Bitcoin (either on-chain or off-chain) with a [Point-Time-Lock Contract](/blog/replacing-htlcs) (PTLC) and claim their token from the server. Otherwise, if the buyer does not do this, the seller can reclaim their token after the locktime using the seller token.

I believe that these kinds of servers are superior (in pretty much every way) to using “blockchain” tokens in any setting requiring trust, such as for tokens issued by a server for things like games. Jonas Nick explored these applications [in this talk](https://diyhpl.us/wiki/transcripts/building-on-bitcoin/2018/blind-signatures-and-scriptless-scripts/) with [these slides](https://nickler.ninja/slides/2018-bob.pdf).

---

## Blind CoinSwap Servers

Another interesting use case for blind signatures is CoinSwap servers. As we discussed in our [blog post about adaptor signatures](/blog/schnorr-applications-scriptless-scripts/), a CoinSwap is a pair of unlinkable transactions, normally having two parties pay each other nearly equal amounts atomically.

Using blind signatures, it is possible to have a blind CoinSwap service where users can pay a small fee to perform CoinSwaps with the server without having the server able to track which outgoing payment corresponds to which incoming payment!

The key idea that will become clear after looking at the mathematical details of Schnorr blind signatures is that just like regular Schnorr signatures, they support pre-committed nonce schemes. Specifically, once the server has given its nonce, and the client has generated its tweaks, the client is able to compute $$s \cdot G$$ where $$s$$ is derived from a blind signature of a known message. As discussed in our [PTLC series](/blog/selling-signatures/), this enables atomic purchase of these signatures. This is accomplished by using $$s \cdot G$$ as an adaptor point in an adaptor signature which signs the user’s payment to the server. Atomic with claiming this payment, the server reveals $$s$$ to the user who can then unblind the signature and use it to claim the payment from the server to the client (after waiting some time to increase their anonymity set). In this way, assuming that all communication with the server is done anonymously (using TOR or Lightning or some other similar mechanism), the server will be unable to link its incoming and outgoing transactions, while providing users with valuable CoinSwaps.

For an in-depth and detailed description of this scheme, I suggest you first read the subsequent section on Schnorr blind signatures and then check out [this document](https://github.com/ElementsProject/scriptless-scripts/blob/master/md/partially-blind-swap.md). I find it to be a really clever combination of MuSig, adaptor signatures and blind signatures all in one!

---

## How do Schnorr Blind Signatures Work?

The communication between a signer with public key $$X$$, and a receiver during the creation of a blind signature looks very much like the [Schnorr ID protocol](/blog/schnorr-id-protocol/):

1.  Signer generates a random $$k$$ and sends $$R$$=$$k \cdot G$$ to the receiver.
2.  The receiver responds with a challenge, $$c$$.
3.  The signer responds with $$s$$=$$k$$+$$c \cdot x$$, where $$x$$ is the signer’s private key.

In the normal Schnorr protocol, the receiver is meant to pick $$c$$ to be the hash H($$X$$,$$R$$, $$m$$) for some message $$m$$ that they want signed. But our goal with blind signatures is to allow the receiver to tweak $$R$$ and $$s$$ in some way to get a signature ($$R$$ ’,$$s$$ ’) where the tweaks are random numbers so that this signature looks completely unrelated to ($$R$$, $$s$$).

So the most straightforward thing we could do if we were trying to come up with such a scheme is have the receiver generate random numbers, $$\alpha, t$$ and let $$X’ = X + t \cdot G,\ R’ = R + \alpha \cdot G$$ be the tweaked public key and nonce. Thus their challenge will be $$c$$= H($$X$$ ’,$$R$$ ’, $$m$$). The resulting blind signature $$s$$=$$k$$+ H($$X$$ ’,$$R$$ ’, $$m$$)$$\cdot x$$ then needs to be tweaked to become a valid schnorr signature for the tweaked nonce,

$$s’ = s + \alpha + c \cdot t = (k + \alpha) + H(X’, R + \alpha \cdot G, m) \cdot (x+t)$$

In this way, we end up with a valid Schnorr signature ($$R$$’, $$s$$’) of the message $$m$$ with the key $$X$$ ’. 

However, this scheme has a fatal flaw. If the signer is attempting to see what it has signed (say by looking at all signatures on Bitcoin transactions) and it comes across ($$R$$ ’, $$s$$ ’) signing a message $$m$$ with public key $$X$$ ’, it won’t be able to recognize any of those values but it will be able to compute H($$X$$’, $$R$$’, $$m$$) and compare this value to the challenge it received in step 2. This breaks our goal of anonymity from the signer.

To try to fix this, we might decide to generate a new random number, $$\beta$$ and use it to tweak our challenge $$c = H(X’, R’, m) + \beta$$. Does this work? Well if this is the challenge presented then the tweaked signature becomes

$$\begin{align*}s’ &= s + \alpha + H(X', R', m) \cdot t\\ &= (k + \alpha) + \left(H(X’, R’, m) + \beta\right) \cdot x + H(X’, R’, m) \cdot t \\&= (k + \alpha + \beta \cdot x) + H(X’, R’, m) \cdot (x+t)\end{align*}$$

As such, we have to add an extra tweak to our nonce to keep things consistent so that now $$R’ = R + \alpha \cdot G + \beta \cdot X$$. Now we finally have a signature ($$R$$ ’, $$s$$ ’) with a public key $$X$$ ’ where all of these values are indistinguishable to the signer from random and where the challenge hash is also random looking! And this is indeed how Schnorr blind signatures are defined.

One final, important note to make is that the Schnorr blind signature scheme is not secure against all kinds of attacks as presented, but simply stipulating that the signer aborts and retries some small percentage of the time does make it secure (but also results in an not-too-efficient signature scheme). Because of this, it generally makes the most sense to use Schnorr blind signatures only when you require Schnorr signatures (such as if the thing being signed is a Bitcoin transaction in the future). For most off-chain use cases for blind signatures, it will likely make more sense to use other blind signature schemes. To be exact, I will quote out of [BIP 340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#Blind_Signatures),

“Schnorr signatures admit a very simple blind signature scheme which is however insecure because it's vulnerable to Wagner's attack. A known mitigation is to let the signer abort a signing session with a certain probability, and the resulting scheme can be proven secure under non-standard cryptographic assumptions.”

This concludes our exploration of Schnorr signatures and their variants! We’ve discussed [Schnorr signatures](/blog/introduction-to-schnorr-signatures/), their [security](/blog/schnorr-id-protocol/), [MuSig](/blog/schnorr-applications-musig/), [adaptor signatures](/blog/schnorr-applications-scriptless-scripts/), [batch verification](/blog/schnorr-applications-batch-verification/), [threshold signatures](/blog/schnorr-applications-threshold-signatures/) and now blind signatures. In the next and final leg of this series, we shall be looking into what we can expect of the Taproot soft-fork beyond Schnorr signatures.