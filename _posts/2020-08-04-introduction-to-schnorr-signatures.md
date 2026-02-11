---
title: 'Introduction to Schnorr Signatures'
author: 'Nadav Kohen'
date: 2020-08-04
permalink: /blog/introduction-to-schnorr-signatures/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
  - Taproot
---

Welcome to the introductory Suredbits Schnorr blog series! In this post, I will explain what Schnorr signatures are and how they intuitively work. In the next post, I will present some evidence as to why this scheme is secure and correct. In the rest of this series, I will be diving into various signatures schemes that Schnorr easily enables and some of their use cases. Before you read on, I recommend you make sure you are comfortable with the following three ideas as I will assume some basic knowledge of them:

1.  [Modular Arithmetic](https://www.khanacademy.org/computing/computer-science/cryptography/modarithmetic/a/what-is-modular-arithmetic) – AKA Math where you only care about remainders
2.  [Hash Functions](https://nakamoto.com/hash-functions/) – Of the cryptographic variety
3.  [Public Keys and Elliptic Curves](https://hackernoon.com/what-is-the-math-behind-elliptic-curve-cryptography-f61b25253da3) – Only read/skim up to the section titled “How to prove you know x” as everything after that will be covered in this post

While this blog series will talk about Schnorr signatures quite generally, most of the motivation for this series is the imminent introduction of Schnorr signatures to the Bitcoin blockchain, which currently uses a different signature algorithm called ECDSA which we will frequently compare to.

## Schnorr Signature Series:

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

## How do Schnorr Signatures Intuitively Work?

Disclaimer: This section is not a security proof or anything rigorous for that matter, just an attempt to convey some intuition about how Schnorr signatures function.

So let’s pretend we live in a world in which we have just discovered the Discrete Log Problem is hard on Elliptic Curves i.e. that it is hard to reverse the process $$x \cdot G$$ where $$x$$ is a big number and $$G$$ is a point on an Elliptic Curve, so that we can use $$x \cdot G = X$$ as a public key for the private key $$x$$. We know that we want to use this fact to create a digital signatures scheme but it has not yet been done. What schemes might we try?

First, let’s consider what goals our signature scheme should accomplish. We want a digital signature to commit to a person’s private key as well as the message being signed. We also want to ensure that a digital signature reveals no information about the signer’s private key. Lastly, we want there to be a way to verify a signature using only public information.

Seeing as our private keys and messages are both encoded as numbers, two natural ways of combining them into a number that commits to both come to my mind: addition ($$x+m$$) and multiplication ($$x \cdot m$$). Note that either operation will be done modulo some number $$p$$ because we don’t want huge signatures and keys are only going to need to be 256 bits anyway, so we usually choose $$p$$ to be a nice number not too far from $$2^{256}$$ (see the definition of $$p$$ for secp256k1). These combination numbers certainly satisfy the first thing we want from our signatures, but it fails our second property because both addition and multiplication (mod $$p$$) are reversible and leak our private key! Well perhaps we can still save one of these procedures by adding in an obfuscation step, so given $$x+m$$ or $$x \cdot m$$, what might we do to “tweak” this number to hide our private key? Well we could just generate a new completely random number, $$k$$, and combine that with our $$x$$ and $$m$$ values as well. Now which way of combining things is just going to be a matter of trial and error as all will provide valid computations which satisfy our first two properties, but not all combinations will give us a way to validate signatures.

After we do a bunch of playing around with various choices of addition and multiplication (mod $$p$$) of our three numbers, we come across $$s = k + m \cdot x$$ which commits to our message and key, using $$m \cdot x$$, but then hides this information with the addition of our random key, $$k$$. The big difference between this choice of combining our three numbers and others is that turning this number into a point, we get some nice structure that makes validation possible from public keys only: given a standard point $$G$$ for our Elliptic Curve used for computing public keys (which everyone agrees upon; see $$G$$ defined for secp256k1), we can take $$G$$ times our signature number and we get

$$
s \cdot G = (k + m \cdot x) \cdot G = k \cdot G + (m \cdot x) \cdot G
$$

because the first point is simply the repeated addition of the point $$G$$ with itself $$k + m \cdot x$$ times which is the same as adding $$k$$ $$G$$’s followed by $$m \cdot x$$ more $$G$$’s. Furthermore, this second representation can be viewed another useful way,

$$
(s \cdot G =) k \cdot G + m \cdot x \cdot G = R + m \cdot X
$$

where $$R = k \cdot G$$ is the public key for $$k$$ and $$X = x \cdot G$$ is the public key for $$x$$, making this computation require only public information (assuming $$R$$ is made public)! One last thing we should do as an optimization is replace $$m$$ with $$H(m)$$ (the hash of $$m$$) because $$m$$ could be very large. This replacement is acceptable because $$H(m)$$ still commits to $$m$$ and so our signature will as well.

Thus our current signature scheme given a private key, $$x$$, and a message, $$m$$, is to generate a random number $$k$$, and publish both $$s$$ ($$= k + H(m) \cdot x$$), and $$R$$ ($$= k \cdot G$$) together. A verifier then verifies this signature by checking if $$s \cdot G = R + H(m) \cdot X$$ where $$s$$ and $$R$$ are given as the signature and $$m$$ is the message and $$X$$ is the signer’s public key.

So we think we’re in the clear but before we invest our time into trying to formally analyze and prove the security of our scheme, we first try to attack it. The first attack that comes to my mind is a forgery attack where someone who does not know a private key attempts to sign for it. As such an attacker, we know the value $$X$$ (public key), $$m$$ (message) and want to generate a valid signature that will satisfy our verification check. In other words, we get to choose the values of $$s$$ and $$R$$ given the values $$X$$ and $$m$$ and we want verification to pass for our signature $$(R, s)$$. Reconsidering our verification equation $$s \cdot G = R + H(m) \cdot X$$, we notice that the following must be true: $$R = s \cdot G – H(m) \cdot X$$ (we get this by subtracting $$H(m) \cdot X$$ from both sides). But wait a minute, we are given the value of $$H(m) \cdot X$$, and we get to choose the value of $$s$$, so we just choose a random number and let that be $$s$$, and then once that choice has been made simply set $$R$$ to be equal to the point resulting from the computation $$s \cdot G – H(m) \cdot X$$. Thus, we can generate any $$s$$ value and compute an $$R$$ value (using only public information) that will create a valid digital signature … not good.

As with before, we figure that this is still going to be salvageable and we just need to tweak something to break this attack. At this point it is a bit of a stretch to say any path forward is obvious, but we shall discuss the true origins of Schnorr signatures in our discussion of proving security (in the next blog post) which will hopefully make this next choice seem more natural.

One way forward is to try and break the equation $$R = s \cdot G – H(m) \cdot X$$ by making $$s$$ depend on $$R$$. One way of doing this is using $$R$$ when we hash the message, yielding $$s = k + H(R, m) \cdot x$$ where $$H(R, m)$$ just means you prefix the message with the point $$R$$ before taking the hash, this is sometimes written as $$H(R \vert\vert m)$$ where $$\vert\vert$$ is the append operation. This breaks our forging attack because now, if a random $$s$$ is chosen, finding an $$R$$ such that $$R = s \cdot G – H(R, m) \cdot X$$ is very hard because of the $$R$$ in our hash, there is no way to find such an $$R$$ that is much better than just trying random values in a brute force manner until one satisfying this equality is found. I want to reiterate that this is not an actual security argument since there may be some other way of doing a forgery, but this does seem to get rid of the obvious attack, and this scheme does turn out to be secure. We have now successfully “discovered” Schnorr signatures!

---

## Definition of Schnorr Signatures

If you have a key pair $$(x, X = x \cdot G)$$, then a Schnorr signature of a message $$m$$ is the pair $$(R, s)$$ where $$k$$ is a random private key and

$$
R = k \cdot G
$$

$$
s = k + H(R, m) \cdot x
$$

Let’s break that down, for every signature, the signer generates a random value, $$k$$, which is essentially a one-time-use private key for this signature. The signer then computes $$R$$, the public key of $$k$$, we call this value $$R$$ the nonce. We next take the hash of $$R$$ and $$m$$, the message, together. This hash is what will actually be signed: it includes the message and a public value so that it is a valid commitment to the message, $$m$$, and we’ll see later that the commitment to $$R$$ is required in order to make this signature scheme secure. Finally, the signer multiplies (mod $$p$$) this hash by their private key (which is just a number, $$x$$) and adds (mod $$p$$) the one-time-use private key, $$k$$, to this resulting in $$s$$. The signature then consists of the pair $$(R, s)$$ where $$s$$ is essentially the actual proof that the entity who knows the private key $$x$$ has signed the message $$m$$, while the value $$R$$ is the one-time-use public key needed to verify this signature along with the normal public key, $$X$$, which is also needed for verification. In Bitcoin, this pair $$(R, s)$$ is encoded using 64 bytes where the first 32 bytes represent $$R$$ and the last 32 bytes represent $$s$$.

So this is one half of the story, signature generation. Once a signature is generated, anyone who knows the message $$m$$ and the public key $$X$$ should now be able to verify this signature. Signature verification is simply checking whether

$$
s \cdot G \stackrel{?}{=} R + H(R, m) \cdot X
$$

where you’ll note that $$m$$ and $$X$$ must be known or given to the verifier while $$R$$ and $$s$$ are given as the signature.

And that is all there is to the actual computation surrounding “vanilla” Schnorr signatures! All it takes to compute a signature is a (one-time-use) key generation, a hash, a multiplication and an addition. Verification takes only a hash, two point multiplications and a point addition. Armed with this knowledge, you should now be able to read and understand the majority of the content of [BIP 340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) which is largely just a more detailed version of the scheme I’ve just described in that it is concerned with exactly how things are encoded and how $$k$$ values are generated and such.

While it is certainly nice to know enough about Schnorr signatures to implement them, we want to go deeper! What properties do Schnorr signatures have and how do they compare to say ECDSA signatures that Bitcoin currently uses? What is the intuition behind why they actually work? How do we know that they are secure? What does security even mean for such a thing? Let us answer each of these questions in turn.

---

## Properties of Schnorr Signatures

First, let’s note a couple of properties that are common across most signature schemes.

**Schnorr signatures look like random numbers**. Specifically the values $$k$$ and $$x$$ are random numbers and $$H(R, m)$$ should also be a random number as it is the output of a hash function, and loosely speaking putting a bunch of random numbers together gives us a random number. What is actually being said here is that the value $$s$$ is equally likely to be any number regardless of what the message is, and who the signer is (these things do not bias the signature value). Note that this argument is not proof that Schnorr signatures leak no information about the signer’s keys, but we will get to this property later in our discussion of security.

**Nonce reuse is FORBIDDEN!** I called the key pair $$(k, R)$$ one-time-use for a reason, if you sign two different messages with the same keys, you will leak the entirety of your private key. Let’s take a look at how an attacker could steal your keys if you make this mistake: The attacker starts with access to $$X$$ (the public key), $$R$$ (the reused nonce), $$m_1$$ (the first message), $$s_1$$ (the first signature), $$m_2$$ (the second message) and $$s_2$$ (the second signature). Recall that the $$s$$ values are a commitment to a message and the private key, $$x$$, tweaked by a random number $$k$$. Thus, if the attacker subtracts the two $$s$$ values from each other, the random tweaks which hide the private key, $$x$$, will cancel out (because nonce reuse means the tweaks are the same). They compute

$$
s_1 – s_2 = (k + H(R, m_1) \cdot x) – (k + H(R, m_2) \cdot x) \quad \text{(by definition)}
$$

$$
= H(R, m_1) \cdot x – H(R, m_2) \cdot x \quad \text{(by cancelling out } k – k \text{)}
$$

$$
= (H(R, m_1) – H(R, m_2)) \cdot x \quad \text{(by factoring out } x \text{)}
$$

As I said, the $$k$$ tweaks cancel out leaving only the difference of the values $$H(\dots) \cdot x$$ which is just $$x$$ times the difference of the two hash values. Lastly, both of these hash values are known as they hash only public information, so that we are left with the equality

$$
s_1 – s_2 = (H(R, m_1) – H(R, m_2)) \cdot x
$$

Where every value but $$x$$ is public, and so the attacker can solve for $$x$$:

$$
x = (s_1 – s_2) \cdot (H(R, m_1) – H(R, m_2))^{-1}
$$

and just like that everyone who sees your two signatures which reuse a nonce knows your private keys and can claim all your bitcoin! BIP 340 tries to ensure that nonce reuse does not happen by generating the value $$k$$ using the message as one of the inputs to the key generation function so that if the message changes, the nonce should change too.

Both of these properties are also true of ECDSA and many other signature protocols and indeed we will actually see that versions of both of these properties are actually integral to the security of Schnorr signatures. Now let us consider two main differences between ECDSA and Schnorr that make Schnorr signatures unique and superior.

**Schnorr Signatures are smaller and faster than ECDSA.** ECDSA signatures used by Bitcoin (DER encoded) are 70 or 71 bytes long while Schnorr signatures are only 64 bytes. Additionally the computation and verification of Schnorr signatures is significantly faster than that of ECDSA signatures.

**Schnorr Signatures are linear.** This is the key difference that sets Schnorr apart and ultimately enables most of the schemes that we will be looking at in this blog series. Linearity is the property of a signature function $$\text{Sign}$$ (which takes in keys and a message as input and outputs the signature) which says that

$$
\text{Sign}(x_1, k_1, m) + \text{Sign}(x_2, k_2, m) = \text{Sign}(x_1 + x_2, k_1 + k_2, m)
$$

This equation essentially says that if two parties sign a message, and then add their signatures, we will end up with a valid signature for their aggregate key! Verifying this holds for a slightly modified version of Schnorr signatures, let the total nonce $$R = R_1 + R_2$$ (which is the sum of each individual nonce) be the point we put in the hash with the message and now we get:

$$
\text{SchnorrSign}(x_1, k_1, m) + \text{SchnorrSign}(x_2, k_2, m)
$$

$$
= (k_1 + H(R, m) \cdot x_1) + (k_2 + H(R, m) \cdot x_2)
$$

$$
= (k_1 + k_2) + H(R, m) \cdot (x_1 + x_2)
$$

$$
= \text{SchnorrSign}(x_1 + x_2, k_1 + k_2, m)
$$

In other words because we modified our signatures to use the same hash, adding two signatures together simply adds the random tweaks $$k$$ together and adds the private keys together in the result, giving us a nice linear signature function.

Note that ECDSA has no equivalent property. We will explore the usefulness of this linearity property throughout the rest of this blog series.

Finally, as is said in BIP 340 “For all these advantages, there are virtually no disadvantages.” Schnorr is the simplest Elliptic Curve-based signature scheme and Bitcoin will do nothing but benefit from switching to them.

---

## Conclusion

In this post we have defined Schnorr signatures, discussed some of their properties in comparison to ECDSA, and even described a false history by which we might intuitively have discovered (most of) Schnorr signatures for ourselves. Furthermore, I’ve sneakily included many of the puzzle pieces that we will use to argue why Schnorr is a secure signature scheme; namely the property that nonce reuse leaks private keys and that our naive approach of $$k + H(m) \cdot x$$ allows a direct forgery attack. We will use these facts and some others to argue that Schnorr is secure in the next blog post, and then we will discuss the many ways in which we can use Schnorr signatures and their linearity (among other properties) to do all sorts of cool things. Stay tuned!