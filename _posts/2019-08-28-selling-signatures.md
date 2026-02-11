---
title: 'Payment Points Part 4: Selling Signatures'
author: 'Nadav Kohen'
date: 2019-08-28
permalink: /blog/selling-signatures/
tags:
  - Bitcoin
  - PTLCs
  - Lightning
---

In our recent posts, we discussed all the benefits and features enabled by Payment Points on the Lightning Network. We explored how they can protect us from wormhole attacks and [payment correlation](/blog/replacing-htlcs), how they enable [“stuckless” payments](/blog/stuckless-payments), and how they allow [escrow contracts](/blog/escrow-contracts/) over Lightning. In this post we will discuss one of my favorite new features: trustlessly selling signatures!

## Payment Points Series:

* [Payment Points Part 1: Replacing HTCLs](/blog/replacing-htlcs)
* [Payment Points Part 2: “Stuckless” Payments](/blog/stuckless-payments)
* [Payment Points Part 3: Escrow Contracts](/blog/escrow-contracts)

---

As we have covered [previously](https://web.archive.org/web/20241113012850/https://suredbits.com/paid-apis/), the Lightning Network enables selling data with some minimal trust in the seller by ensuring that the data is received atomically with payment completion. This still requires trust in the seller because although the data is received if and only if the user pays, the user has no way of validating that they will receive the data that they expect – as opposed to some random garbage. This is fine for many applications such as paying an oracle for data.  But what about enabling payment in exchange for data in more adversarial contexts?

This is where Payment Points come to the rescue. Since a point reveals some information about its underlying scalar, we are going to be able to do some validation. Whereas this is impossible with hashes since they destroy all information. 

In particular, note that every Schnorr signature, $$s$$, of a message, $$m$$, with (public) keys $$P$$and$$R$$has the property that$$s \cdot G = R + m \cdot P$$. This means that without knowing anything useful about the signature $$s$$itself,$$s \cdot G$$(the payment point associated with$$s$$) is computable from public information, namely $$R$$, $$P$$and$$m$$. Thus, using $$s \cdot G$$as the payment point will ensure that$$s$$ will be the Proof of Payment (PoP) which is received by the buyer atomically with payment completion!

This scheme mitigates all trust in the seller as they must reveal exactly the $$s$$the buyer has specified in order to claim the funds they have been offered. There is no way for the seller to get paid without revealing a valid signature of a message$$m$$ specified by the buyer.

Jonas Nick has [discussed in depth](https://youtu.be/XORDEX-RrAI?t=26552) how this kind of signature selling enables ecash/blind side-chains as well as selling anonymous credentials. He also mentions that this scheme can be used to sell Discreet Log Contract (DLC) signatures.

I would like to take this last idea one step further. Not only can DLC signatures be bought and sold, but they can be bought in only *one* direction enabling Discreet Log Option Contracts (DLOCs). An option contract is when one party, say Alice, purchases the option or right, but not the obligation, to execute a contract (e.g. to buy Bitcoin tomorrow at double the price, which would be favorable if she thinks the price will more than double) from some other party, say Bob. 

If the Lightning Network were to move to payment points, Alice could enter into a DLOC with Bob in which she would buy his signatures to the transactions which spend the funding transaction. In this way, only she can execute these transactions (since Bob cannot generate Alice’s signatures), or choose not to after which the contract will timeout and Alice and Bob will have their funds returned (except for the premium Alice paid Bob for his signatures). Thus, a Payment Point Lightning Network would enable fully P2P option contracts.

This concludes our Payment Point Proposals series. We covered how the Lightning Network is currently prone to payment correlation and wormhole attacks due to its use of [payment hashes](/blog/replacing-htlcs). We showed how these problems are solved by Payment Points. And we covered how a point-based Lightning Network enables “[stuckless” payments](/blog/stuckless-payments/), [escrow contracts](/blog/escrow-contracts/), and selling signatures. Although Payment Points are not currently slated for Lightning v1.1, I’m hopeful that we migrate to this objectively better routing solution once bip-taproot gets into bitcoin-core.