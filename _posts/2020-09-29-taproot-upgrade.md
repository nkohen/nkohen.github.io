---
title: 'The Taproot Upgrade'
author: 'Nadav Kohen'
date: 2020-09-29
permalink: /blog/taproot-upgrade/
tags:
  - Bitcoin
  - Cryptography
  - Digital Signatures
  - Schnorr
---

So far in this series we have discussed Schnorr Digital Signatures, their security, and their many variants and benefits. As you may know, Schnorr signatures are going to be introduced to the Bitcoin blockchain using a softfork known as Taproot. In a [previous blog post](https://web.archive.org/web/20241113012850/https://suredbits.com/activating-taproot/), Ben talked about various ways Taproot may be activated. In this post, we’re going to be talking about exactly what changes are included in the Taproot softfork including how Schnorr signatures will be added!

## Schnorr Signature Series:

* [What are Schnorr Signatures – Introduction](/blog/introduction-to-schnorr-signatures)
* [Schnorr Signature Security: Part 1 – Schnorr ID Protocol](/blog/schnorr-id-protocol)
* [Schnorr Signature Security: Part 2 – From IDs to Signatures](/blog/schnorr-id-to-signature)
* [Schnorr Multi-Signatures – MuSig](/blog/schnorr-applications-musig)
* [Scriptless Scripts – Adaptor Signatures](/blog/schnorr-applications-scriptless-scripts)
* [Batch Verification](blog/schnorr-applications-batch-verification)
* [Schnorr Threshold Signatures](/blog/schnorr-applications-threshold-signatures)
* [Flexible Round-Optimized Schnorr Threshold – FROST](/blog/schnorr-applications-frost)
* [Schnorr Blind Signatures](/blog/schnorr-applications-blind-signatures/)

---

Generally speaking, the Taproot softfork is specified in BIPs [340 (Schnorr)](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki), [341 (SegWit V1)](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) and [342 (Validation)](https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki). The softfork is implemented as a new SegWit version (version 1) meaning that outputs show up on chain as OP_1 followed by some data. These outputs will be trivially validated by nodes which have not updated and are understood to be taproot addresses by updated nodes which will enact further validation rules. This means that the new rules will apply only to these new kinds of addresses (leaving all other UTXOs unaffected).

Before I detail all of the rule changes, I’d like to include some excerpts from BIP 341 which answer some common questions. As I start to detail all new changes below, you may wonder why these changes have all been bundled up into a single upgrade instead of many smaller upgrades; the BIP authors say,

> “… separating them all into independent upgrades would reduce the efficiency and privacy gains to be had, and wallet and service providers may not be inclined to go through many incremental updates.”

The changes in these BIPs happen to work out in such a way that the use of any major feature introduced in this softfork can be made to look like one another. Thus, introducing all of them together increases the privacy gained from this change as it creates a very large anonymity set for all users of many of the new features. This said, the scope of the three BIPs is actually very well contained into an enumerable set of changes,

> “In this design we strike a balance by focusing on the structural script improvements offered by Taproot and Merkle branches, as well as changes necessary to make them usable and efficient. For things like sighashes and opcodes we include fixes for known problems, but exclude new features that can be added independently with no downsides.”

As has been alluded to, the Taproot upgrade consists of three major features: Merkle Branches (MAST), Taproot (confusingly named as both an upgrade and a feature), and Schnorr signatures. Taproot also contains some really nice minor improvements that address known pain points in Bitcoin protocols. We will go through each of these features and improvements in turn.

---

## Merkle Branches (MAST)

[Merkle trees](https://en.wikipedia.org/wiki/Merkle_tree) are a hash-based data structure that has been in use since [Bitcoin’s conception](https://bitcoin.org/bitcoin.pdf). They allow a single on-chain hash to commit to a nearly arbitrarily large set of data. The data structure itself is a [binary tree](https://en.wikipedia.org/wiki/Binary_tree) with each node containing the hash of its children hashes, Hash(left_child_hash $$\vert\vert$$ right_child_hash), and the leaf nodes contain the hashes of the actual data elements being committed to. The root node’s hash goes on chain and subsequently anyone who knows the whole tree can prove that a certain leaf node is part of the tree by only revealing a branch leading down to that leaf (and no other data from the set).

Merkle trees are already used in bitcoin blocks for [Simplified Payment Verification (SPV)](https://en.bitcoinwiki.org/wiki/Simplified_Payment_Verification) which allows someone who has seen a block to prove to a light client the inclusion of a specific transaction in a block without making the light client look at the block at all.

The Taproot softfork will make merkle trees of spending conditions the new way of spending UTXOs. For example, say that you want to create an output that can either be spent by one key revealing a hash preimage or else can be spent by another key after a certain timeout (Hash Time Lock Contract). Using merkle branches, you would separate these two spending conditions into separate short scripts, and then combine them in a merkle tree, putting the root hash on-chain. When it comes time to spend this output, you simply provide a merkle proof that the condition you are using was committed to, without revealing the other possible condition(s), and then spend from that script as usual.

The proposal of using Merkle trees to commit to scripts is often called Merklized Abstract Syntax Trees or MAST for short.This improvement will allow for increased privacy when spending UTXOs as you no longer need to reveal your entire script, and this exact feature also reduces the on-chain footprint of spending from large or complicated spending conditions.

Another key benefit of MAST, especially when combined with Schnorr signatures and key aggregation, is that the number of distinguishable UTXO spends becomes very small. Nearly every input which uses MAST will either reveal a single spending condition which is a single public key or a spending condition which is a time-locked single public key. This combines the anonymity set of average bitcoin users (with simple single public key spends) and technical contract users increasing both groups’ on-chain privacy and increasing Bitcoin’s fungibility.

---

## Taproot

Building on the MAST improvement is another *feature* confusingly called Taproot (after which the entire upgrade is named). The idea behind the Taproot feature is to combine the traditionally separate pay-to-key and pay-to-script output types into one type of output, a Taproot output. This is accomplished by putting on-chain a tweaked public key:

$$Q = P + H(P, m) \cdot G$$

Where *P* is a public key which can spend this output and *m* is a merkle root of a MAST which contains script conditions under which this output can be spent.

If no single public key (including an aggregate or threshold one) is permitted to spend an output, then a provably unknown public key is used, and if no scripts are permitted to spend an output (meaning a pay-to-public-key output is desired) then *m* is empty/omitted.

When spending a Taproot output using the pay-to-public-key condition, you simply provide a digital signature for the public key Q which you can do because you know H(*P*, *m*) and the private key to *P* so that you can sign using the private key sum of these two numbers. Alternatively, when spending using the pay-to-script condition, you reveal *P* and *m* allowing validators to see that *Q* does indeed commit to *m*, and then you provide a Merkle proof that a specific script is committed to by *m* and then you spend that script.

The result of this scheme is that all outputs look identical on-chain, and furthermore scripts which can have a cooperative “everybody agrees” branch can use the [MuSig](https://suredbits.com/schnorr-applications-musig/) aggregation of all public keys as their *P* and cooperating parties are not require to reveal that a script even existed, making their on-chain footprint equivalent to a single person spending a normal single-key output!

---

## Schnorr Signatures (OP_CHECKSIG)

The final major feature of the Taproot softfork is that Taproot scripts at the leaves of a MAST, called TapScripts, interpret the operation codes OP_CHECKSIG and OP_CHECKSIGVERIFY to mean checking for a valid [Schnorr digital signature](/blog/introduction-to-schnorr-signatures) instead of an ECDSA signature. The benefits of this feature are massive and we have been discussing them for this entire series, so I won’t linger on this point here.

---

## Miscellaneous Improvements

Along with the three major features being introduced which we’ve discussed, there will also be a few other improvements included in the Taproot upgrade.

### New SigHash Algorithm Includes All Outputs Spent

In my opinion, the most important of these is that a new signature hash mode (called default) is introduced to be valid for Taproot outputs which commits to all of the usual things committed to by SIGHASH_ALL in current Bitcoin transactions, but additionally commits to all of the transaction outputs being spent by the transaction being signed.

This is of huge importance to all multi-party protocols as it allows signing clients which don’t have access to the UTXO set (e.g. hardware wallets and light clients) to safely take part in multi-party transaction signing without the need for extra data. Currently, protocols such as the [Lightning Network](https://github.com/lightningnetwork/lightning-rfc), [Discreet Log Contracts](https://github.com/discreetlogcontracts/dlcspecs), using a hardware wallet, and others require light clients to parse and validate all transactions being spent by a transaction they are participating in signing. This can be extremely impractical, as transactions can be very large (e.g. CoinJoin transactions) and a multi-party protocol can result in many inputs. The need for this extra data is often referred to as a BIP 143 vulnerability. The requirement that this extra data be present also hinders pruned clients which do not have their own previous transaction data in memory.

The introduction of the new default signature hash algorithm fixes all of these issues and means that clients no longer need to store extra data or do extra validation before signing transactions in multi-party protocols!

### MINIMALIF is Enforced

Another small but significant improvement is that MINIMALIF is no longer just standard but required. Previously, when using OP_IF or OP_NOTIF, one could enter as witness any non-empty data and this would count as “true”. MINIMALIF stipulates that “true” is encoded *only* as the number 1. Not enforcing MINIMALIF in consensus code meant that there was a possibility of witness malleability where a malicious actor could change their script witness (from one expected and required by some other party) by changing their 1 to some other number (say 2) without affecting the validity of their script witness. With Taproot outputs, using a non-standard representation of “true” for OP_IF will now be considered invalid as a violation of consensus rules, removing this malleability attack vector.

### Pathway for Future Upgrades

All TapScripts (scripts at the leaves of a MAST) will be versioned so that future soft-fork updates of TapScript will not require the use of a new SegWit version, but rather will only require the much less intrusive change of a new TapScript version. Likewise certain disabled operation codes are re-interpreted in TapScript as OP_SUCCESS allowing for softfork compatible introduction of new operation codes without massive changes!

### Tagged Hashes

All hashes involved in the above Taproot proposals are tagged hashes. A tagged hash is when you take an existing hash function (like SHA256) and prefix all inputs to this function with a special tag representing the protocol the hash is being used for. For example MAST leaf hashes, MAST branch hashes, and Taproot hashes (from the tweaking of the public key) all use different tags. This creates what is called domain separation which protects against attacks where the same hash can be interpreted multiple different ways by forcing a specific interpretation due to the tag.

If you are interested in the nitty gritty details specifying exactly how all of the above is achieved, I strongly recommend reading BIPs [341](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) and [342](https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki) as they are written in a relatively accessible way.

With this post, we have concluded our deep exploration of Schnorr signatures and their impact on contracts. We’ve now gone through, in detail, [what Schnorr signatures are](/blog/introduction-to-schnorr-signatures), [why they’re secure](/blog/schnorr-id-protocol), how they enable [multi-signatures](/blog/schnorr-applications-musig), [adaptor signatures](/blog/schnorr-applications-scriptless-scripts), [batch verification](/blog/schnorr-applications-batch-verification), [threshold signatures](/blog/schnorr-applications-threshold-signatures), [blind signatures](/blog/schnorr-applications-blind-signatures), how they will be introduced to Bitcoin and more! [Schnorr support has recently been merged into bitcoin-core](https://github.com/bitcoin/bitcoin/pull/19944) and there is an [open pull request containing the Taproot upgrade](https://github.com/bitcoin/bitcoin/pull/19953) (which you should review if you’re interested and able); once merged, all that will be left to do is [activate](https://web.archive.org/web/20241113012850/https://suredbits.com/activating-taproot/)!