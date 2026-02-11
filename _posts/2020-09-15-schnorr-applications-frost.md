---
title: 'Schnorr Applications: FROST'
author: 'Nadav Kohen'
date: 2020-09-15
permalink: /blog/schnorr-applications-frost/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
  - Threshold Signatures
---

In the [last post](/blog/schnorr-applications-threshold-signatures/) of this series we discussed Threshold Signature schemes as well as their uses and I’d like to continue that discussion today with an exploration of FROST. FROST can be thought of as the natural extension of [MuSig](/blog/schnorr-applications-musig/) to thresholds ($$t$$-of-$$n$$ instead of just $$n$$-of-$$n$$) utilizing distributed key generation. FROST is in some sense the most general threshold scheme we’ve covered so far as it has the awesome feature that it generates keys and signatures indistinguishable (on-chain) from normal (single) Schnorr keys and signatures! In this post, I will be describing FROST in quite a bit of technical detail building up the idea of distributed key generation and then applying it to Schnorr signatures.

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Batch Verification](blog/schnorr-applications-batch-verification)
* [Schnorr Threshold Signatures](/blog/schnorr-applications-threshold-signatures)
* [Schnorr Blind Signatures](/blog/schnorr-applications-blind-signatures/)
* [Taproot Upgrade – Activating Schnorr](https://web.archive.org/web/20241113012850/https://suredbits.com/the-taproot-upgrade/)

---

## Implementation with FROST

The construction of [Flexible Round-Optimized Schnorr Threshold (FROST)](https://eprint.iacr.org/2020/852.pdf) signatures is quite elegant and relies on some cryptographic and mathematical building blocks that we haven’t yet covered on this blog series. I am going to slowly build up the FROST protocol (or some simplified version of it) without assuming the reader is familiar with any of these concepts. Though be warned, if you are not already familiar with the math ahead, make sure to take the following sections slowly and spend some time with them.

At a high level, FROST is a somewhat natural conversion from secret sharing of private keys to secret sharing of signatures, that is, a protocol describing how to use key shards to construct signature shards which can be put together to construct full signatures without revealing the shared sharded key.

---

### Building Block 1: Polynomial Interpolation

As opposed to $$n$$-of-$$n$$ schemes like [MuSig](/blog/schnorr-applications-musig/) which can use simple additive sharding of the shared key (i.e. the aggregate key is a sum of the participants keys),$$t$$-of-$$n$$ threshold schemes must use some construction which allows any $$t$$ parties to control the underlying key. We can’t use any direct additive schemes on participant keys in this context because then all parties would need to be involved in order to control and sign for the summative key. Specifically we need a mathematical object which admits $$n$$ parties to each have a piece of information and where if any $$t$$ of them get together, they can determine the object.

I’m going to assume that most of my readers know that two points uniquely determine a line. Thus, if we wanted to construct a 2-of-3 key sharding scheme, we could construct a line which contains our secret (say at the $$y$$-intercept) and give each of the three parties a point on the line. Any two parties could then get together and use the secret to sign for it while any one party alone gains no information about the secret because given a point on a line, there is equal probability that any other point will be on that line, meaning no information is given to individual parties without collaboration.

As it turns out, we can generalize this idea using polynomials. A polynomial is a curve in the plane containing all points $$(x, y)$$ satisfying the equation $$y = a_nx^n + a_{n-1}x^{n-1} + \cdots + a_2x^2 + a_1x + a_0$$ where the coefficients $$a_n, \ldots, a_0$$ are some fixed numbers (mod $$p$$). We call $$n$$ the degree of the polynomial where $$a_n$$ is non-zero. Recall that a line is a degree 1 polynomial $$y = a_1x + a_0$$. Feel free to play around with polynomials to get a feel for them [here](https://www.desmos.com/calculator/nproi7ulnj). It is a fact that an $$n$$ degree polynomial is uniquely determined by any $$n+1$$ points (see [various proofs](https://math.stackexchange.com/questions/837902/prove-there-exists-a-unique-n-th-degree-polynomial-that-passes-through-n1-p) if interested). As such, given $$n+1$$ points $$(1, y_1), \ldots, (n+1, y_{n+1})$$ one can construct the unique degree $$n$$ polynomial going through these points as follows:

1. For $$i=1, \ldots, n+1$$, let $$P_i(x) = \prod_{j=1, j\neq i}^{n+1}(x - j) = (x-1)(x-2)\cdots (x-(i-1))(x-(i+1))\cdots (x-(n+1))$$ that is, the product of $$(x - j)$$ for all $$j$$ not equal to $$i$$.

2. Define $$P(x) = \sum_{i=1}^{n+1}y_i\prod_{j=1, j\neq i}^{n+1} \frac{x-j}{i-j} = \sum_{i=1}^{n+1}y_i\frac{P_i(x)}{P_i(i)} = y_1\frac{P_1(x)}{P_1(1)} + y_2\frac{P_2(x)}{P_2(2)} + \cdots + y_{n+1}\frac{P_{n+1}(x)}{P_{n+1}(n+1)}$$

Notice that $$P(i) = 0 + 0 + \cdots + 0 + y_i\frac{P_i(i)}{P_i(i)} + 0 + \cdots + 0 = y_i$$ for $$i$$ equal to each of $$1, \ldots, n+1$$. This means that this $$P(x)$$ must be our unique polynomial!

Given $$n+1$$ points on a degree $$n$$ polynomial, we now know how to reconstruct the entire polynomial, this process is called Polynomial Interpolation. Notably, we can compute $$P(0)$$ by plugging in zero to the above getting the formula $$P(0) = \sum_{i=1}^{n+1}y_i\lambda_i = y_1\lambda_1 + y_2\lambda_2 + \cdots + y_{n+1}\lambda_{n+1}$$

where $$\lambda_i = \prod_{j=1,j\neq i}^{n+1}\frac{j}{j-i} = \left(\frac{1}{1-i}\right)\left(\frac{2}{2-i}\right)\cdots\left(\frac{n+1}{n+1 - i}\right)$$(the $$i$$ th term is skipped) is just a constant number.

---

### Building Block 2: Shamir Secret Sharing

As I’ve been alluding to, secret sharing (aka secret sharding) is a process where $$n$$ participants each have some “share” (aka shard) of the secret where the participants can combine their shares in some way to compute the underlying shared secret. For example, say I have some private key $$x$$ stored on my phone but I’m worried about losing my phone, I could find 3 of my most trustworthy friends and give each of them a share of my secret where I give my first two friends $$a$$ and $$b$$ which are random numbers (mod $$p$$) I generated, and the third friend receives $$(x - a - b)$$ which you’ll note, looks random. Now my friends, even in pairs, gain no information about $$x$$ and only if I lose my phone and need to recover my key do I tell my friends to each give me their share after which I can take the sum to get $$a + b + (x - a - b) = x$$.

This example secret sharing scheme is usually referred to as additive secret sharing. It is likely the simplest secret sharing scheme but as such it has the restriction that it can only be used for $$n$$-of-$$n$$ secret sharing and not threshold secret sharing. Notably if any one of my friends loses their share then all other shares become void.

I could instead choose to construct a line, $$f$$, with $$y$$-intercept being my private key, $$f(0) = x$$. I could then give my three friends the points $$(1, f(1)), (2, f(2)), (3, f(3))$$ respectively so that I now only need to ask two of my friends for their shares in order to compute my secret using interpolation as described in the previous section! More generally given $$n$$ friends and some threshold $$t < n$$, we can construct a degree $$t-1$$ polynomial and give each friend a point. The polynomial is constructed by using a random coefficient for each $$a_i$$ except for $$a_0$$ which is set equal to be my secret. This scheme is called Shamir Secret Sharing.

Note that in some sense any set of $$t$$ Shamir shares,$$y_{k_1}, \ldots, y_{k_t}\text{ with } S = \{k_1,\ldots,k_t\}$$ being the set of participants, can be converted into additive shares by multiplying $$y_{k_i}\text{ by }\lambda_i = \prod_{j\in S,j\neq i}\frac{j}{j-i}$$ because the shared secret

$$f(0) = y_{k_1}\lambda_{k_1} + y_{k_2}\lambda_{k_2} + \cdots + y_{k_t}\lambda_{k_t}$$

So far we have only been considering secret sharing situations with a trusted share dealer, but we’re going to need a secret sharing scheme with less trust involved when we are trying to construct shared private keys. Such a scheme is called a Verifiable Secret Sharing scheme. Say that I am an untrusted dealer trying to do a $$t$$-of-$$n$$ secret share with $$n$$ non-trusting parties. I do the Shamir Secret Sharing process described above (giving each party a point on a $$t-1$$ degree polynomial) and additionally I broadcast to everyone the public key for each of my coefficients $$A_0 = a_0 \cdot G, \ldots, A_{t-1}=a_{t-1} \cdot G$$. Upon receiving one’s share $$(i, f(i))$$, each participant can verify their share by checking if $$f(i) \cdot G$$ is equal to $$i^{t-1} \cdot A_{t-1} + \cdots + i \cdot A_1 + A_0$$. If any party finds that this validation does not pass, they tell all other participants and reveal their share. All other parties reveal their shares so that the polynomial can be computed and the public keys of the coefficients checked against the shares the dealer gave. Either the dealer cheated and they get banned, or the participant lied and they get banned. Regardless, this scheme passes if everyone is truthful and terminates if anyone cheats.

---

### Building Block 3: Distributed Key Generation

Now the fun can begin! We have a threshold verifiable secret sharing scheme which we can use to create a shared private key through a process called Distributed Key Generation. Note that so far we have described how to take an existing key that some dealer knows and distribute shares to some parties, whereas we are now discussing how to construct a key which no one party knows.

This is achieved by having all $$n$$ parties generate a random secret and asynchronously, all parties perform a verifiable secret share for their secret. After this is done and all shares are validated, each party can add the y-coordinates of their shares together to get a share of the aggregate polynomial. Note that if $$f(x)$$ and $$g(x)$$ are two polynomials, then $$(f+g)(x)$$ is the sum of the two polynomials and $$f(i) + g(i) = (f+g)(i)$$ so that the sum of shares corresponds to a share of the sum of the polynomials. Thus, at the end of this process each party should have a share of the aggregate polynomial which stores the sum of all party’s secrets since $$f_1(0) + f_2(0) + \cdots + f_n(0) = (f_1 + f_2 + \cdots + f_n)(0)$$. Furthermore, if every party’s polynomial is degree $$t-1$$ then the aggregate will also have that degree so that the aggregate polynomial will support a $$t$$-of-$$n$$ threshold scheme!

Let’s go through that again with more details. Each participant has a unique identification number between $$1$$ and $$n$$. Participant $$i$$ generates a random degree $$t-1$$ polynomial by generating $$t$$ random secrets $$a_{i0}, \ldots, a_{i(t-1)}$$ as the coefficients. Next, each party is required to provide a proof of knowledge of $$a_{i0}$$ as this is their contribution to the shared secret. This is done using the [non-interactive Schnorr ID protocol](/blog/schnorr-id-protocol/) using a random nonce $$k_i$$, and using a challenge $$c_i$$ equal to the hash of their ID,$$i$$, the public keys $$a_{i0} \cdot G\text{ and }k_i \cdot G$$ as well as all other relevant context to the distributed key generation protocol. Namely $$sig_i = (k_i \cdot G, k_i + c_ia_{i0})$$. Each participant then broadcasts to all other participants their signature as well as all public keys of their coefficients $$a_{i0} \cdot G,\ldots,a_{i(t-1)} \cdot G$$. Upon receiving these values, all participants validate all other participants’ signatures. This concludes the first round of interaction.

In the second round, each party securely sends each other participant their share $$(i, f_k(i))$$ where $$k$$ is the id of the sending party and $$i$$ is the id of the receiving party. Participant $$i$$ then validates this share using party $$k$$ ’s public keys from the previous round. Upon receiving all counterparty shares, each participant computes the sum $$s_i = f_1(i) + \cdots + f_n(i)$$ so that $$s_i$$ is their share of the aggregate secret.

This Distributed Key Generation (DKG) protocol requires only two rounds of communication after which each party has a valid share of the persistent (threshold) aggregate secret (and note that from all coefficient public keys from round 1, each party can compute every other party’s public key $$s_i \cdot G$$ and consequently the aggregate public key which is the sum of these).

---

### FROST Signing Procedure

Now we are ready to construct some threshold signatures! We assume that the $$n$$ parties sometime in the past have created a $$t$$-of-$$n$$ threshold sharded private key of which they each have a share as described in the previous section.

We begin with a preprocessing round which can be done in advance of signing (say during key generation) but it can also be done as an extra round before signing. During this round participant $$i$$ creates a list of random single-use nonce pairs $$(d_{i1}, e_{i1}), (d_{i2}, e_{i2}), \ldots, (d_{i\pi}, e_{i\pi})\text{, where }\pi$$ is the number of signatures this party can participate in generating before another preprocessing round is needed, and publishes (someplace all parties can see) the list of corresponding public keys for these single-use secrets $$(D_{ij}, E_{ij})$$.

Assuming a distributed key has been generated and preprocessing has occurred, we are finally ready to sign a message, $$m$$. Some party (likely one of the signers) will take on the role of a Signature Aggregator (SA) and choose a set of $$t$$ signers (likely including themselves), let's call this list of ids $$S$$. The SA will also retrieve the next unused public keys $$(D_{ij}, E_{ij})$$ for each of these signers, let’s call the list $$B$$. The SA sends $$B$$ and the message $$m$$ to each of the $$t$$ parties. For each $$k$$ in $$S$$, the binding value $$\rho_i$$ is defined to be the hash of $$i$$, and $$B$$(which commits to the party, all other parties and their nonces), and the message. These binding values are computed by all signers. The aggregate nonce for the signature to be generated is going to be $$R$$ equal to the sum of each $$k$$ in $$S$$ of the points $$D_{kj} + \rho_k \cdot E_{kj}$$ and consequently the challenge hash to be signed is the hash of the aggregate public key,$$R$$, and the message.

At this point, each signer uses their persistent secret share, $$s_i$$(from the DKG), to generate a partial signature. Since $$s_i$$ is already being used, we will call this partial signature $$z_i$$.

$$z_i = d_{ij} + \rho_i \cdot e_{ij} + H(X, R, m) \cdot s_i \cdot \lambda_i$$

Note that this is a Schnorr partial signature of $$m$$ using one-time-use private key $$d_{ij} + \rho_i \cdot e_{ij}$$ and private key $$s_i \cdot \lambda_i$$ where you’ll recall $$\lambda_i$$ is a constant number defined for each possible $$S$$ which we defined in our Polynomial Interpolation section which convert Shamir secret shares into additive ones (i.e. the aggregate private key is equal to the sum of the $$t$$ terms $$s_i \cdot \lambda_i$$).

The signature aggregator, SA, receives all of these partial signatures and validates them. Assuming they all pass validation, the SA then simply adds all of the signatures together to get

$$z = z_1 + \cdots + z_t$$

And finally we have $$(R, z)$$ is a valid Schnorr signature for the (threshold) aggregate key from the original DKG!

This concludes our discussion of Schnorr threshold signature schemes. Stay tuned for more posts yet-to-come about Schnorr blind signatures and Taproot more generally.