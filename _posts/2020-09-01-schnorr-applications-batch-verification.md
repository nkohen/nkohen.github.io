---
title: 'Schnorr Applications: Batch Verification'
author: 'Nadav Kohen'
date: 2020-09-01
permalink: /blog/schnorr-applications-batch-verification/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
---

So far in this series, we’ve discussed [what Schnorr signatures are](/blog/introduction-to-schnorr-signatures), why [they are secure](/blog/schnorr-id-protocol/), and how Schnorr variants can be used to implement [private and scalable multi-signatures](/blog/schnorr-applications-musig) and [scriptless scripts using adaptor signatures](/blog/schnorr-applications-scriptless-scripts/). Today we will be looking at yet another exciting improvement Schnorr will be introducing to the Bitcoin ecosystem, Batch Verification!

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Schnorr Threshold Signatures](/blog/schnorr-applications-threshold-signatures)
* [Flexible Round-Optimized Schnorr Threshold – FROST](/blog/schnorr-applications-frost)
* [Schnorr Blind Signatures](/blog/schnorr-applications-blind-signatures/)
* [Taproot Upgrade – Activating Schnorr](https://web.archive.org/web/20241113012850/https://suredbits.com/the-taproot-upgrade/)

---

As is stated in [BIP 340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#motivation), “The specific formulation of ECDSA signatures that is standardized cannot be verified more efficiently in batch compared to individually, unless additional witness data is added. Changing the signature scheme offers an opportunity to address this.” In other words, in their current form, there is no way to verify a large number of ECDSA signatures that is faster than individually verifying each one. Introducing a new standard for (Schnorr) signatures has allowed us to make design decisions that will enable what is called batch verification, which is a process in which many signatures can be verified at once in a process faster than verifying each signature individually.

Before we look into how this is done, let us consider the potential benefits of batch verification to the Bitcoin network. There are many situations where one must verify many signatures, for example, when validating a new block, every node on the network must validate every digital signature of every input of every transaction. With currently implemented Schnorr batch verification, verifying all signatures in a block in a batch will become over twice as fast as individually verifying each signature.

Potentially even more exciting, during initial block download (IBD), new nodes must verify every single signature on the entire blockchain. The speedup of using batch verification grows logarithmically with the number of signatures being verified so that one could use batch verification to verify one billion signatures with at least a four-fold speedup! (Though I will note that this may be somewhat infeasible today as it would require a crazy amount of RAM). There are somewhere on the order of a billion signatures on the blockchain right now but sadly this speedup won’t apply to them, since they are all ECDSA signatures. However, future blocks containing Schnorr signatures could benefit from the speedup of batch verification for IBD in decades to come.

While these two use cases seem to be the most fundamental and universal use cases of batch verification in Bitcoin, I will note that one can batch verify any set of Schnorr signatures. This means one could verify multiple BIP 340 powered blockchains (e.g. Future Liquid + Bitcoin) at the same time. Alternatively one could even see minor speedups in interactive multi-party protocols where 10s or 100s of parties are passing around partial signatures in a large MuSig.

If you are interested in how much faster verification becomes for a given number of signatures, check out [this graph](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#design) on BIP 340.

---

## How Does Batch Verification Work?

The statement of the batch verification algorithm is only marginally more complicated than normal verification and it may be hard, at first, to see where the speedup comes from in comparison to applying normal verification in sequence. Given $$n$$ public key, message, and signature triples $$(P_i, m_i, (R_i, s_i))$$, the verifier generates $$n$$ random numbers $$a_1, \dots, a_n$$, computes the $$n$$ challenge hashes $$e_i = H(P_i, R_i, m_i)$$ and checks if

$$
(a_1s_1 + a_2s_2 + \dots + a_ns_n) \cdot G \stackrel{?}{=} a_1 \cdot R_1 + a_2 \cdot R_2 + \dots + a_n \cdot R_n + (a_1e_1) \cdot P_1 + (a_2e_2) \cdot P_2 + \dots + (a_ne_n) \cdot P_n
$$

Note that this is adding together all of the individual verification equations ($$s_i \cdot G \stackrel{?}{=} R_i + e_i \cdot P_i$$) multiplied on both sides by our random number $$a_i$$. As such, if all signatures are valid, then this verification should pass. However, note that if we had not generated random numbers $$a_1, \dots, a_n$$ and instead naively added all the verifications together then it would be possible to add many invalid signatures together and get a valid batch verification.

For example, if $$(R, s)$$ and $$(R’, s’)$$ are both valid signatures and $$(R, s’)$$ and $$(R’, s)$$ are not, then this latter pair of signatures would still pass batch validation. Or even more nefariously, it could be possible for someone who wants to include some invalid signature $$(R_1, s_1)$$ to compute some other invalid signature $$(R_2, s_2)$$ such that $$(s_1 + s_2) \cdot G = R_1 + R_2 + e_1 \cdot P_1 + e_2 \cdot P_2$$. This is why we allow the verifier to generate random numbers to thwart any such attempt at cancellation of invalid signatures with other invalid signatures. Note, however, that there is still some (very tiny, negligible) probability that the random numbers are chosen in such a way that an invalid batch may be considered valid, meaning that this algorithm is “probabilistic”.

Hopefully it is now clear why this batch verification algorithm works, but why is it faster? After all, as written, it may seem that we are doing the same number of point multiplications and additions as we would be doing if we verified each signature independently. But as it turns out, there are algorithms for computing sums of multiples of points faster than multiplying and then adding. That is to say that given some expression

$$
a_1 \cdot P_1 + a_2 \cdot P_2 + \dots + a_n \cdot P_n
$$

there are many ways we can compute the resulting point that are faster than doing $$n$$ multiplications followed by $$n-1$$ additions. I will present one of the simpler algorithms that requires fewer operations to do this computation called Bos-Coster’s algorithm, though note that for large batches it is more efficient to use other algorithms (namely Pippenger’s).

The algorithm goes as follows: Given the above expression,

1.  Rewrite the expression by sorting the summands by their coefficients so that in the resulting expression, $$a_1$$ is the largest coefficient followed by $$a_2$$ and so on.
2.  Rewrite the first sum $$a_1 \cdot P_1 + a_2 \cdot P_2$$ as $$(a_1 - a_2) \cdot P_1 + a_2 \cdot (P_1 + P_2)$$ and discard the new first summand if the coefficient is 0. Note that for the cost of a single point addition $$(P_1 + P_2)$$, which is much much cheaper than a point multiplication, we were able to reduce one of our coefficients dramatically ($$a_2$$ is the second largest coefficient).
3.  Repeat steps 1 and 2 until there is only one element left. This last element will either be $$a \cdot P$$ or $$0$$. In the former case, $$a$$ will be the greatest common divisor (GCD) of the original coefficients. Note that $$a$$ will always be at most the smallest coefficient, although it will almost always be $$1$$(especially for large $$n$$).

Running this algorithm avoids almost all point multiplications and results in a much faster process than doing $$n$$ point multiplications.

We could apply this algorithm (or other more efficient and more complicated algorithms) to our batch verification equation by subtracting the left side of the check to get the equivalent equation:

$$
0 \stackrel{?}{=} a_1 \cdot R_1 + \dots + a_n \cdot R_n + (a_1e_1) \cdot P_1 + \dots + (a_ne_n) \cdot P_n - (a_1s_1 + \dots + a_ns_n) \cdot G
$$

Where our right side is now of the form of an addition of a bunch of point multiplications. If this verification is to pass, then our process should cancel out all of the terms resulting in a $$0$$ without having to perform a single point multiplication!

The interested reader might be interested in reading [this survey](https://cr.yp.to/papers/pippenger.pdf) of such algorithms. Additionally, [here is the pull request](https://github.com/bitcoin-core/secp256k1/pull/760) adding batch verification for Schnorr signatures.

Aside from [exploring what Schnorr signatures are](/blog/introduction-to-schnorr-signatures/) and [why they’re secure](/blog/schnorr-id-protocol/), we’ve now also seen how [Schnorr multi-signatures](/blog/schnorr-applications-musig/) (such as MuSig) and [Schnorr adaptor signatures](/blog/schnorr-applications-scriptless-scripts/) make contracting on Bitcoin more private and scalable, as well as improving verification times using batch verification. And yet, there’s even more to discuss! Stay tuned for next week’s post about Schnorr threshold signatures.