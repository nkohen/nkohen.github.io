---
title: 'DLC Oracle Failure Cases'
author: 'Nadav Kohen'
date: 2021-04-06
permalink: /blog/dlc-oracle-failure-cases/
tags:
  - Bitcoin
  - DLCs
---

Discreet Log Contracts (DLCs) are bitcoin-compatible non-custodial oracle contracts in which participants post Bitcoin collateral which is settled depending on an event in the “real-world” as attested to by a set of oracles. In this post, we will be exploring in-depth the ways in which oracles can fail which DLC users should be aware of, as well as some mitigation strategies.

If you are unaware of [what a DLC is](/blog/what-is-a-dlc), [how they function](/blog/how-dlcs-work), or [how multiple oracles can be used](/blog/multi-oracle-dlc-deep-dive/) in a single DLC then please read our [previous blog posts](/tags/#dlcs) on these topics.

Trust is a fundamental requirement in any digital contracting scheme in which contract execution is contingent on “real-world” events, and DLCs are no exception. This requirement is often referred to as “The Oracle Problem,” but I find this name to be misleading as it does not represent a problem to be “solved” because this would imply that there is some way to use oracles without trust. But at the end of the day, if the oracles cannot or do not provide truthful digital attestations, then the digital contracts which depend on those oracles will fail to execute correctly.

There are many proposals in existence for partially mitigating oracle trust, the simplest and most common of which is using multiple oracles so as to remove single points of failure. Perhaps in future blog posts we will explore further mitigation involving concepts such as incentives, staking, and recourse, but in this post I want to focus on what happens to the DLCs themselves in the worst-case scenario of oracle failure.

Let us first describe what oracle failure looks like and then explore how DLCs respond to oracle failure using a multi-oracle example. Broadly speaking, there are three categories of oracle failure: false attestation, no attestation, and multiple attestations. Understanding these failure scenarios is essential to understanding what kind of trust, exactly, is required in DLC oracles. Understanding oracle failure is also important knowledge for oracle operators.

---

## False Attestation

A false attestation has occurred when an oracle digitally attests to an event which did not occur. Some examples include attesting that the price of Bitcoin was $6,000 when it was $60,000, attesting that a losing team won a basketball tournament, or attesting that it was raining when it was in fact sunny.

If a DLC uses only a single oracle which falsely attests to the event in question, then the DLC will act just as it would if the falsely attested-to event truly happened in the real world, which may result in a loss of funds. For example, in the above instances the DLCs would settle as if the price was $6,000, the losing team had won, and it was raining. In the single-oracle case, DLCs treat the oracle attestation as the only source of truth.

False attestations can occur if an oracle has malicious intent, such as if they are performing an exit scam where they either wish harm on certain DLC participants, or else they have accepted bribes or have taken positions anonymously against unsuspecting users.

False attestations can also be the result of human error in some of many forms. Examples include error during manual data entry (from either the oracle or the oracle’s source of data), bugs in an oracle’s software (or hardware), or cases of ambiguous or contentious truth.

Lastly, false attestations can be the result of an attack targeting an oracle. Examples include any attack which comprises the oracle’s private keys, as well as deception or manipulation by the oracle’s data source, and [man-in-the-middle attacks](https://en.wikipedia.org/wiki/Man-in-the-middle_attack) where an attacker may be able to hijack a communication channel between the oracle and their data source.

---

## No Attestation

If a DLC uses only a single oracle which does not produce any valid attestation to the event in question, then the DLC will refund the users’ collateral after the contract timeout. An oracle does not produce a valid attestation if it either produces no attestation or else an attestation to an outcome which was not included in that oracle’s committed-to possible outcome set. DLCs do not distinguish between these two kinds of failure so I will refer to this case singularly as the “no attestation” case.

Just as was the case with false attestations above, an oracle may refuse to produce an attestation if it has malicious intent and wishes to grief certain users or else profit from bribes or secretly being a counterparty in DLCs using itself as an oracle.

No attestation may also be the result of an oracle’s inability to produce an attestation, either due to losing access to their private keys or else because of a [denial of service (DoS) attack](https://en.wikipedia.org/wiki/Denial-of-service_attack). Examples of DoS attacks against an oracle include DLC users attempting to take down oracle servers to benefit from a refund in the case of a disadvantage real-life outcome, or else possibly a censorship attack perpetrated by an oracle-trusted party such as a cloud computing provider. Lastly there is also the possibility of a DoS attack against a particular DLC client to prevent them from being available to receive an existing oracle attestation, but this kind of attack has many mitigations both inside of client software and externally (such as using watch towers).

---

## Multiple Attestations (Equivocation)

Multiple attestations have occurred if an oracle equivocates, attesting to multiple outcomes such as saying that the price of Bitcoin is simultaneously $6,000 and $60,000 or that both teams won a game of basketball. This kind of oracle failure is also called equivocation.

In most cases of DLC oracle equivocation, the oracle’s private keys are leaked via a process called nonce-reuse meaning that they not only attest to two distinct outcomes, but functionally they have attested to all possible outcomes because users can generate arbitrary attestations using the oracle’s private keys.

If a DLC uses only a single oracle which attests to multiple outcomes for the event in question, then the DLC can settle using any attested outcome which essentially leads to a race between DLC participants (assuming they are not willing to cooperate) where each party will attempt to close with the most advantageous settlement transaction and the first to confirm their transaction to the blockchain wins.

While it is technically feasible for an oracle to equivocate due to malicious intent, it does not generally make very much sense to do so in most cases as an oracle has more to gain by falsely attesting to an event as opposed to equivocating as they do not leak their private keys and avoid races for themselves or their co-conspirators.

More likely this failure can occur if the oracle’s private keys become compromised, or else there is a mistake made by the oracle either in manual entry, software, or hardware.

---

## Example: Using 2-of-3 Multi-Oracle Setup

Oracle failure in a single-oracle DLC guarantees contract failure where the result is either loss of (deserved) funds due to a false outcome, loss of (deserved) funds due to a refund, or a race in which the losing party loses (deserved) funds. [Using multiple oracles](/blog/multi-oracle-dlc-deep-dive) to enforce a DLC removes this single point of failure.

Let’s now explore all possible failure cases for (arguably) the simplest interesting multi-oracle setup where three oracles are considered, and if any two agree then that is considered the truth.

* Success Scenarios
    * No oracle failures: They all agree!
    * Exactly one oracle failure (of any kind).
        * Two oracles agree and the failing third oracle is ignored.
* Refund Scenarios
    * Three contradicting oracle attestations.
        * There are at least two oracles with inconsistent false attestations.
    * Two disagreeing oracle attestations and one silent oracle.
        * One non-attestation and at least one false attestation.
    * Two or Three silent oracles
* Loss of (deserved) Funds Scenarios
    * Two agreeing false oracle attestations.
        * This causes the DLC to execute as if the agreed lie is the truth.
    * One false attestation and one equivocation.
        * If the equivocating oracle’s keys are leaked, then this results in a race between DLC participants where the only two settlement outcomes are the true outcome and the falsely attested-to outcome, otherwise it leads to a guaranteed loss through execution of the falsely attested-to outcome.
        * If the third oracle is silent, then even if the equivocating oracle’s keys are leaked, there is a guaranteed loss through execution of the falsely attested-to outcome.
    * Two equivocating oracles.
        * If 2 of the  oracles’ private keys are leaked, then this leads to an arbitrary race between DLC participants where every settlement transaction is valid.
        * If only one oracle’s private key is leaked, then this leads to a race where only the true outcome and the falsely attested-to outcomes of the non-key-leaking oracle are possible results.
        * If neither oracle’s private keys are leaked, then either they agree on exactly one outcome which is guaranteed to be (incorrectly) settled to, or they agree on multiple outcomes which leads to a race between those outcomes, or else a refund occurs in the case that no outcomes are agreed upon.

This example demonstrates that using multiple oracles removes single points of failure and mitigates against some multi-failure cases to some extent. Using even more oracles (e.g. 3-of-5, 4-of-7, etc.) can further increase the robustness of a DLC by requiring an increasing number of failures to occur before the DLC settlement is affected. (Note that this is only the case so long as the oracles added are truly trustworthy, for example simply adding random-entity oracles does not improve security).

Stay tuned for more content about Discreet Log Contracts and oracles! If you want to learn more, check out the resources below.

### Resources

[DLC Specification](https://github.com/discreetlogcontracts/dlcspecs)

[Multi-Oracle Specification (WIP)](https://github.com/discreetlogcontracts/dlcspecs/pull/128)

[Krystal Bull (Oracle) Release](https://suredbits.com/release-of-suredbits-oracle-explorer-and-krystal-bull/)

[DLC Telegram](https://t.me/bitcoindlcs)

[DLC Mailing List](https://mailmanlists.org/mailman/listinfo/dlc-dev)