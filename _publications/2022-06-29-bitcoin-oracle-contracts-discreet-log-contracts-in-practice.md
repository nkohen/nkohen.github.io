---
title: "Bitcoin Oracle Contracts: Discreet Log Contracts in Practice"
collection: publications
category: conferences
permalink: /publication/2022-06-29-bitcoin-oracle-contracts-discreet-log-contracts-in-practice
excerpt: 'In this paper, we discuss the design of the Discreet Log Contract specification and its performance.'
date: 2022-06-29
venue: 'IEEE International Conference on Blockchain and Cryptocurrency'
paperurl: 'https://ieeexplore.ieee.org/document/9805512'
---

Contracts established on a blockchain remove the need for intermediary third parties, but usually require external data to decide on an outcome, provided by a so-called oracle. Discreet Log Contracts were proposed as a way to establish such contracts on the Bitcoin blockchain without requiring interaction with an oracle, increasing the privacy of the contracting parties. To enable cross-compatible implementations to be developed, a specification effort was carried out, that led to various improvements over and additions to the original proposal. In particular, we present in this paper a simpler protocol making use of adaptor signatures, detail the handling of contracts with numerical outcomes, and how to create them using multiple oracles. We also provide some algorithmic optimizations to speed up contract creation and experimental results on performance highlighting their impact and demonstrating the useability of the overall system.

[Published here](https://ieeexplore.ieee.org/document/9805512).