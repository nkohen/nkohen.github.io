---
title: 'Discreet Log Contracts Part 1: What is a Discreet Log Contract?'
author: 'Nadav Kohen'
date: 2019-09-05
permalink: /blog/what-is-a-dlc/
tags:
  - Bitcoin
  - DLCs
---

Previously we have analyzed Discreet Log Contracts (DLCs) at a high level and briefly walked through a specific contract executed between [Blockstream and Crypto Garage](https://web.archive.org/web/20241113012850/https://suredbits.com/discreet-log-contracts-blockstream-crypto-garages-contract/). In this series we will be delving further into DLCs, looking at what they are, how they work, their security model, trust model and some of their benefits.

* [Part 2 – How Discreet Log Contracts Work](/blog/how-dlcs-work)
* [Part 3 – Why Discreet Log Contracts Are Great](/blog/why-dlcs-are-great)
* [Part 4 – Security and Trust Model](/blog/dlc-security-and-trust-model/)

---

A Discreet Log Contract is a “simple” oracle contract scheme proposed by [Tadge Dryja of MIT](https://adiabat.github.io/dlc.pdf). DLCs can be executed using almost any blockchain, including Bitcoin. An oracle contract starts with users locking up the funds involved. Then those funds are spent based on some external outcome, which is broadcasted by an oracle. The naive approach of implementing this as a traditional smart contract on a smart contracting platform, such as Ethereum, has many drawbacks.

> “Two of the biggest hurdles to [the] implementation and adoption [of smart contracts] have been scalability of the smart contracts, and the difficulty in getting data external to the currency system into the smart contract. Privacy of the contract has been another issue to date. Discreet Log Contracts are a system which addresses the scalability and privacy concerns and seeks to minimize the trust required in the oracle which provides external data.” – [DLC White Paper](https://adiabat.github.io/dlc.pdf)

The scalability hurdle usually comes in the form of [high fees or long wait times](https://web.archive.org/web/20241113012850/https://suredbits.com/bitcoin-vs-lightning-fees/). Most smart contracts require you interact on-chain too frequently which, when network throughput is reached, causes high fees or long wait times. Note that simply increasing throughput doesn’t change final confirmation waiting time since it does not increase security to simply have more blocks more often.

It can also come in the form of unmaintainable full nodes, which would be the case if a blockchain’s blocks were too big and in full use. The external data hurdle Tadge discusses is commonly referred to as “The Oracle Problem”. This is the problem of how to manage trust when bringing “real world information” into a digital realm – such as a blockchain.

Lastly, most traditional smart contracts are completely public. They are just programs posted publicly on a blockchain after all. Not only is the contract public information but all interactions with that contract are also done publicly. There are many use cases in which this is highly undesirable, especially for applications on blockchains which often assume adversarial conditions. Notably, any good solution to The Oracle Problem likely requires the oracle contracts to remain private.

These are the major problems with today’s smart contracts that motivate DLCs.

But what is a DLC and how do they mitigate these issues?

The simple, 2-party, DLC model involves the two counter-parties, Alice and Bob, as well as an oracle, Suredbits. Suredbits does not require any knowledge about Alice, Bob, or their plans for entering a DLC. In fact, the only interaction Alice and Bob have with Suredbits is receiving publicly broadcast signatures of the event they are speculating on. These signatures will give Alice and Bob the power to unilaterally execute the agreed upon contract, without any trust in one another.

Furthermore, the only on-chain footprint left by Alice and Bob is a funding and a spending transaction, neither of which reveal their contract (or the involvement of Suredbits). At no point do the actual conditions of the contract (who gets what on the possible outcomes) go onto the blockchain, all of those conditions are enforced off-chain!

![Two parties pay into a 2-of-2 multi-signature address that pays back out to two parties.](/images/blog/DLCFootprint.png)

Since DLCs have such tiny on-chain footprints, they are almost entirely private contracts. They are also extremely scalable since almost all of the execution is performed with only the parties involved off-chain, using the blockchain only for (somewhat) privately settling disputes (which is the thing blockchains are built for: consensus).

This has covered what DLCs are at a high level. But the only way to really grasp what is going on with DLCs is to look at the details, which we will explore in our next blog post. Apart from simply going through how they work, we will also cover their numerous benefits over traditionally used oracle contracts. Stay tuned!