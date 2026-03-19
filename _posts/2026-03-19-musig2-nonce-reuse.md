---
title: 'A Practical Attack Against Limited MuSig2 Nonce Reuse'
author: 'Nadav Kohen'
date: 2026-03-19
permalink: /blog/musig2-nonce-reuse/
tags:
  - Cryptography
  - Digital Signatures
  - Schnorr
---

I know what you're thinking, "Duh, everyone knows that nonce reuse is bad ... why are you writing a blog post about how nonce reuse is insecure?" Fair enough, but hear me out. As we'll discuss, it is pretty trivial to compute someone's private key if they are unfortunate enough to reuse a Schnorr signature nonce; however, I claim that it is less clear why nonce reuse leads to practical attacks in the multi-signature scheme [MuSig2](https://eprint.iacr.org/2020/1261.pdf).

For example, I have been unable to get any LLMs (I tried Gemini Pro 3.1, Claude Sonnet 4.6 and whatever the free ChatGPT is right now) to give me a satisfactory answer as to why reusing nonces is unsafe even in the case that I am ensuring that nonces are only reused once (i.e., it is possible to generalize the attach against normal Schnorr signatures if you are reusing nonces multiple times, but it's less clear what is wrong with reusing nonces "just once").

I figured I should write down all the nasty details so that the LLMs (and you) can be better informed in the future. It also just so happens that this attack translates into an attack on a reasonable sounding Schnorr threshold signature scheme that we will briefly mention at the end.

## Background
Let's start with a quick recap of what Schnorr signatures are, the role that nonces play, and how many parties can aggregate their keys and still generate signatures using MuSig2.

In our context, if you have a private key, $$x$$, then its corresponding public key is $$X = g^x$$ where $$g$$ is a generator point for the secp256k1 elliptic curve. You don't really have to know what that means other than to know that it is easy to compute $$g^x$$ from $$x$$ but hard to go the other way, and that if I have two key pairs $$(x, X = g^x)$$ and $$(y, Y = g^y)$$ then the product of the public keys $$XY = g^xg^y = g^{x + y}$$ is equal to the public key corresponding to the sum of the private keys.

### Schnorr Signatures
For a slower introduction to Schnorr signatures, see [this post](/blog/introduction-to-schnorr-signatures).

A Schnorr signature of the message $$m$$ for the key pair $$(x, X)$$ is a pair $$(R, s)$$ where $$R$$ is some elliptic curve point (like a public key) called the nonce and $$s$$ is a value such that $$g^s = RX^c$$, where $$c = H_{sig}(X, R, m)$$. If you know $$x$$, then you can generate a signature by choosing a random value $$r$$, letting $$R = g^r$$ and setting $$s = r + c\cdot x$$. This ensures that $$g^s = g^{r + c\cdot x} = g^r(g^x)^c = RX^c$$. The function of the nonce is to hide your private key by being an additive tweak, since anyone can compute $$x$$ given $$c\cdot x$$ by dividing out $$c$$, but adding a random number to $$c\cdot x$$ makes the total sum into a random-looking value. However, if you re-use the same $$R$$ value between two signatures of two different messages, then anyone who sees these two signatures knows

$$
\begin{align}
s_1 &= r + c_1\cdot x\\
s_2 &= r + c_2 \cdot x
\end{align}
$$

from which they can compute your private key:

$$
\frac{s_1-s_2}{c_1 - c_2} = \frac{r + c_1\cdot x - r - c_2 \cdot x}{c_1-c_2} = \frac{x(c_1-c_2)}{c_1 - c_2} = x.
$$

Basically it comes down to the fact that there are two unknowns in a Schnorr signature, $$r$$ and $$x$$, and if you give someone two signatures using these same unknowns then they get two equations with which they can solve for the two unknowns. But so long as you use fresh random nonces for each signature you produce, you introduce a new unknown each time you create a new equation so that there will always be more unknowns than equations.

### MuSig2 Aggregate Signatures

One of the primary benefits of Schnorr signatures is that they have a nice "linearity" property, namely that if I add two Schnorr signatures using the same signature hash, $$c$$, then I get something that still has the form of a Schnorr signature:

$$
s_1 + s_2 = (r_1 + c\cdot x_1) + (r_2 + c\cdot x_2) = (r_1 + r_2) + c\cdot (x_1 + x_2).
$$

[MuSig2](https://eprint.iacr.org/2020/1261.pdf) is a two-round protocol that uses this property in the following way. If some group of parties have the multi-set of public keys $$L = \{X_1,\ldots, X_n\}$$, then we define their aggregate public key to be $$\tilde{X} = \prod_{i=1}^nX_i^{H_{agg}(L, X_i)} = X_1^{a_1}X_2^{a_2}\cdots X_n^{a_n}$$, where $$a_i = H_{agg}(L, X_i)$$ is the "key aggregation coefficient" for $$X_i$$ in $$L$$. The purpose of these hash-defined key aggregation coefficients is to prevent a "Rogue Key Attack" that is possible if no coefficients are used, where an attacker waits to hear what everyone else's keys are before claiming their public key is $$X_n = X(X_1X_2\cdots X_{n-1})^{-1}$$ so that $$\tilde{X} = X_1X_2\cdots X_{n-1}X_n = X$$, which has a private key known by the attacker.

In the first round of signing a message, each party generates a pair of secrets $$(r_{1,i},r_{2,i})$$ and the corresponding pair of points $$(R_{1,i}, R_{2,i})$$ that will be used to define the aggregate nonce. Namely we combine the first values and the second values together, $$R_j = \prod_{i=1}^nR_{j,i} = R_{j,1}R_{j,2}\cdots R_{j,n}$$ (for $$j\in\{1,2\}$$), and then we set the aggregate nonce to be $$R = R_1R_2^b$$, where $$b = H_{non}(\tilde{X}, (R_1, R_2), m)$$. Notice that given $$(R_1, R_2)$$ and a message $$m$$ so that $$b$$ can be computed, then $$R = R_1R_2^b = (R_{1,1}R_{2,1}^b)(R_{1,2}R_{2,2}^b)\cdots (R_{1,n}R_{2,n}^b)$$, so that each party's effective nonce is $$R_{1,i}R_{2,i}^b$$. In other words each party gets to choose its contribution $$(R_{1,i}, R_{2,i})$$ to the aggregate nonce but they do not get to control the value $$b$$ used to combine these values, and the value $$b$$ changes anytime anyone changes any of their contributions.

In the second round of signing a message $$m$$ (which doesn't need to be known until this round), each party computes $$b = H_{non}(\tilde{X}, (R_1, R_2), m)$$ and $$R = R_1R_2^b$$ and $$c = H_{sig}(\tilde{X}, R, m)$$. This is the shared signature hash that all parties will use. Next, each party generates a partial signature $$s_i = r_{1,i} + b\cdot k_{2,i} + c\cdot a_i\cdot x_i$$. These values can then be combined to compute

$$
\begin{align}
s &=\sum_{i=1}^ns_i\\
&= s_1 + s_2 + \cdots + s_n\\
&= (r_{1,1} + b\cdot r_{2,1} + c\cdot a_1\cdot x_1) + \cdots + (r_{1,n} + b\cdot r_{2,n} + c\cdot a_n\cdot x_n)\\
&= (r_{1,1} + \cdots r_{1,n}) + b(r_{2,1} + \cdots + r_{2,n}) + c(a_1\cdot x_1 + \cdots a_n\cdot x_n)\\
&= (r_1 + b\cdot r_2) + c\tilde{x},
\end{align}
$$

where $$g^s = R_1R_2^b\tilde{X}^c = R\tilde{X}^c$$, thus this aggregate signature validates as a normal Schnorr signature for the aggregate key.

Similarly to how reusing nonces in Schnorr above leads to enough equations in a fixed set of unknowns to solve for the private key, it is insecure to reuse partial nonces $$(R_{1,i}, R_{2,i})$$ because if you generate three partial signatures:

$$
\begin{align}
s_i^{(1)} &= r_{1,i} + b^{(1)}\cdot r_{2,i} + c^{(1)}\cdot a_i\cdot x_i\\
s_i^{(2)} &= r_{1,i} + b^{(2)}\cdot r_{2,i} + c^{(2)}\cdot a_i\cdot x_i\\
s_i^{(3)} &= r_{1,i} + b^{(3)}\cdot r_{2,i} + c^{(3)}\cdot a_i\cdot x_i
\end{align}
$$

then anyone with these three values can solve this system of equations to compute

$$
\begin{align}
\left(
\begin{array}{ccc|c}
1 & b^{(1)} & c^{(1)}a_i & s_i^{(1)} \\
1 & b^{(2)} & c^{(2)}a_i & s_i^{(2)} \\
1 & b^{(3)} & c^{(3)}a_i & s_i^{(3)}
\end{array}
\right) &\rightarrow \left(
\begin{array}{ccc|c}
1 & b^{(1)} & c^{(1)}a_i & s_i^{(1)} \\
0 & b^{(2)} - b^{(1)} & (c^{(2)} - c^{(1)})a_i & s_i^{(2)} - s_i^{(1)} \\
0 & b^{(3)} - b^{(1)} & (c^{(3)} - c^{(1)})a_i & s_i^{(3)} - s_i^{(1)}
\end{array}
\right)\\
&\rightarrow \left(
\begin{array}{ccc|c}
1 & b^{(1)} & c^{(1)}a_i & s_i^{(1)} \\
0 & 1 & \frac{(c^{(2)} - c^{(1)})a_i}{b^{(2)} - b^{(1)}} & \frac{s_i^{(2)} - s_i^{(1)}}{b^{(2)} - b^{(1)}} \\
0 & b^{(3)} - b^{(1)} & (c^{(3)} - c^{(1)})a_i & s_i^{(3)} - s_i^{(1)}
\end{array}
\right)\\
&\rightarrow \left(
\begin{array}{ccc|c}
1 & b^{(1)} & c^{(1)}a_i & s_i^{(1)} \\
0 & 1 & \frac{(c^{(2)} - c^{(1)})a_i}{b^{(2)} - b^{(1)}} & \frac{s_i^{(2)} - s_i^{(1)}}{b^{(2)} - b^{(1)}} \\
0 & 0 & (c^{(3)} - c^{(1)})a_i - (b^{(3)} - b^{(1)})\frac{(c^{(2)} - c^{(1)})a_i}{b^{(2)} - b^{(1)}} & s_i^{(3)} - s_i^{(1)} - (b^{(3)} - b^{(1)})\frac{s_i^{(2)} - s_i^{(1)}}{b^{(2)} - b^{(1)}}
\end{array}
\right)\\
&\rightarrow \left(
\begin{array}{ccc|c}
1 & b^{(1)} & c^{(1)}a_i & s_i^{(1)} \\
0 & 1 & \frac{(c^{(2)} - c^{(1)})a_i}{b^{(2)} - b^{(1)}} & \frac{s_i^{(2)} - s_i^{(1)}}{b^{(2)} - b^{(1)}} \\
0 & 0 & 1 & \frac{s_i^{(3)} - s_i^{(1)} - (b^{(3)} - b^{(1)})\frac{s_i^{(2)} - s_i^{(1)}}{b^{(2)} - b^{(1)}}}{(c^{(3)} - c^{(1)})a_i - (b^{(3)} - b^{(1)})\frac{(c^{(2)} - c^{(1)})a_i}{b^{(2)} - b^{(1)}}}
\end{array}
\right),
\end{align}
$$

and thus,

$$
x_i = \frac{s_i^{(3)} - s_i^{(1)} - (b^{(3)} - b^{(1)})\frac{s_i^{(2)} - s_i^{(1)}}{b^{(2)} - b^{(1)}}}{(c^{(3)} - c^{(1)})a_i - (b^{(3)} - b^{(1)})\frac{(c^{(2)} - c^{(1)})a_i}{b^{(2)} - b^{(1)}}}.
$$

Details aside, this attack is pretty conceptually straightforward. However, it is only possible if a nonce pair is being reused three times. Does this mean that reusing a nonce just once is safe because a system of equations with two equations and three unknowns still has a degree of freedom? The answer turns out to be no, this is not safe, but it requires a more complicated attack. Before we discuss this attack in the next section, let's first interrogate why the nonce hash, $$b = H_{non}(\tilde{X}, (R_1, R_2), m)$$, is a necessary component of MuSig2 (this will also allow us to introduce an important element of the attack in the next section).

Let's consider an insecure version of MuSig2, where instead of $$R = R_1R_2^b$$, we just set $$R = R_1R_2$$. To show that this is insecure, we will describe an attack that allows an adversarial participant in a 2-of-2 setup to create a (universal) forgery, that is, to create a signature for the aggregate key on any new message, $$m$$, without help from the honest participant. The adversary initiates the first round for $$q$$ concurrent signing sessions and receives the values $$(R_{1,1}^{(k)}, R_{2,1}^{(k)})$$ from the other (honest) participant for each signing session, $$k\in\{1,2,\ldots, q\}$$. Next, the adversarial signer chooses its $$R_{1,2}^{(k)}$$ values honestly (at random) so that they can compute $$R_1^{(k)}$$ for each signing session. The adversary sets their forgery's nonce to be the product of all honest nonce contributions, $$R = \prod_{k=1}^q R_{1,1}^{(k)}R_{2,1}^{(k)}$$. Next, if possible, they want to choose their values $$R_{2,2}^{(k)}$$ (which contributes to $$R_2^{(k)}$$) such that

$$
\sum_{k=1}^q c^{(k)} = \sum_{k=1}^q H_{sig}(\tilde{X}, R_1^{(k)}R_2^{(k)}, m^{(k)}) = H_{sig}(\tilde{X}, R, m) = c.
$$

If they can make such choices, then they send their nonce values to the honest counterparty and receive in return $$q$$ partial signatures, $$s_1^{(k)} = r_{1,1}^{(k)} + r_{2,1}^{(k)} + c^{(k)}\cdot a_1\cdot x_1$$. Then if they add all of these partial signatures together, they get

$$
\begin{align}
\sum_{k=1}^q s_1^{(k)} &= \sum_{k=1}^q r_{1,1}^{(k)} + r_{2,1}^{(k)} + c^{(k)}\cdot a_1\cdot x_1\\
&= \sum_{k=1}^q r_{1,1}^{(k)} + r_{2,1}^{(k)} + \left(\sum_{k=1}^q c^{(k)}\right)a_1\cdot x_1\\
&= r + c\cdot a_1\cdot x_1.
\end{align}
$$

Since the adversary knows $$x_2$$, then can then complete their valid forgery as follows:

$$
\begin{align}
\left(\sum_{k=1}^q s_1^{(k)}\right) + c\cdot a_2\cdot x_2 &= r + c\cdot a_1\cdot x_1 + c\cdot a_2\cdot x_2\\
&= r + c\cdot(a_1\cdot x_1 + a_2\cdot x_2)\\
&= r + c\cdot\tilde{x}.
\end{align}
$$

This entire attack rests on the ability of the adversary to find inputs to the signature hash such that $$\sum_{k=1}^q c^{(k)} = c$$. Although it is hard to find a hash collision, and this may seem like it should be similarly hard, it turns out that it is actually not as hard to find a sum of a large number of hashes that equals any fixed value. Namely, there is an algorithm known as [Wagner's Algorithm](https://www.enseignement.polytechnique.fr/informatique/profs/Francois.Morain/Master1/Crypto/projects/Wagner02.pdf) that can find such an additive "collision" in time $$O\left(q\cdot 2^{\frac{n}{1 + \log_2(q)}}\right)$$, where $$n=256$$ is the size of the output hash. Thus, for example, if we set $$q = 256 = 2^8$$ to be the number of sessions in the above attack, then Wagner's algorithm requires about $$2^8\cdot 2^{\frac{256}{1 + 8}}\approx 2^{8 + 29} = 2^{37}$$ work (which is practical on modern machinery).

In view of this attack, the role that $$b = H_{non}(\tilde{X}, (R_1, R_2), m)$$ plays is that it is no longer possible to use Wagner's Algorithm to solve the equation

$$
\sum_{k=1}^q H_{sig}(\tilde{X}, R_1^{(k)}R_2^{(k)}, m^{(k)}) = H_{sig}(\tilde{X}, R, m)
$$

because on the right-hand side $$R = \prod_{k=1}^q R_1^{(k)}(R_2^{(k)})^{b^{(k)}}$$ is no longer a constant since $$b^{(k)} = H_{non}(\tilde{X}, (R_1^{(k), R_2^{(k)}}, m^{(k)}))$$ changes every time any of those inputs is changed. Wagner's Algorithm makes it feasible to find a sum of hashes that equals a _fixed_ value, but if each attempt leads to a different target sum the algorithm no longer helps. To be clear, I have described how adding this nonce hash in the aggregate nonce computation stops an attacker from performing the forgery attack I just described, but a separate argument is required to show that using the nonce hash in this way does lead to a secure scheme (such an argument is given in the [MuSig2 paper](https://eprint.iacr.org/2020/1261.pdf)).

Now that we have all of the background and we're aware of how Wagner's Algorithm can be used, let's describe an attack against an insecure version of MuSig2 where we reuse nonces _just once_.

## The Attack

Imagine that we are in a 2-of-2 MuSig2 with another party that is reusing their nonces, making sure to only ever reuse them once to avoid trivially leaking their private key as described above. This means that for every first-round setup in which they send us $$(R_1^{(k)}, R_2^{(k)})$$, we can respond two different ways and receive two different partial signatures,

$$
\begin{align}
s_1^{(k)} &= r_1^{(k)} + b^{(k,1)}\cdot r_2^{(k)} + c^{(k,1)}\cdot a_1\cdot x_1,\text{ and}\\
s_2^{(k)} &= r_1^{(k)} + b^{(k,2)}\cdot r_2^{(k)} + c^{(k,2)}\cdot a_1\cdot x_1
\end{align}
$$

from our victim. Just as in the attack against Schnorr signature nonce reuse, we can eliminate $$r_1^{(k)}$$ by considering the difference of these two equations

$$
s_2^{(k)} - s_1^{(k)} = (b^{(k,2)} - b^{(k,1)})r_2^{(k)} + (c^{(k,2)} - c^{(k,1)})\cdot a_1\cdot x_1.
$$

Next, we cannot eliminate $$r_2^{(k)}$$, but we can divide by $$(b^{(k,2)} - b^{(k,1)})$$ in order to arbitrarily control the coefficient on this variable, namely

$$
\frac{\alpha}{b^{(k,2)} - b^{(k,1)}}(s_2^{(k)} - s_1^{(k)}) = \alpha\cdot r_2^{(k)} + \frac{\alpha(c^{(k,2)} - c^{(k,1)})a_1}{b^{(k,2)} - b^{(k,1)}}\cdot x_1.
$$

In hopes of making use of Wagner's Algorithm to achieve our attack, let's consider the sum of many $$s_1^{(k)}$$ values:

$$
\sum_{k=1}^q s_1^{(k)} = \sum_{k=1}^q r_1^{(k)} + b^{(k,1)}\cdot r_2^{(k)} + c^{(k,1)}\cdot a_1\cdot x_1.
$$

We can just let our forgery nonce value be $$r = \sum_{k=1}^q r_1^{(k)}$$, but we need to eliminate $$r_2^{(k)}$$ before we can apply Wagner's Algorithm to the coefficient on $$x_1$$. To this end, we can set $$\alpha = -b^{(k,1)}$$ and include the resulting expression in our sum:

$$
\begin{align}
\sum_{k=1}^q s_1^{(k)} + \frac{-b^{(k,1)}}{b^{(k,2)} - b^{(k,1)}}(s_2^{(k)} - s_1^{(k)}) &= \sum_{k=1}^q r_1^{(k)} + b^{(k,1)}\cdot r_2^{(k)} + c^{(k,1)}\cdot a_1\cdot x_1 -b^{(k,1)}r_2^{(k)} - \frac{b^{(k,1)}(c^{(k,2)} - c^{(k,1)})a_1}{b^{(k,2)} - b^{(k,1)}}\cdot x_1\\
&= \sum_{k=1}^q r_1^{(k)} + \left(c^{(k,1)}\cdot a_1 - \frac{b^{(k,1)}(c^{(k,2)} - c^{(k,1)})a_1}{b^{(k,2)} - b^{(k,1)}}\right) x_1.
\end{align}
$$

Finally, we can use Wagner's Algorithm to find $$R_2$$-values to respond to our victim with such that

$$
\sum_{k=1}^q c^{(k,1)} - \frac{b^{(k,1)}(c^{(k,2)} - c^{(k,1)})}{b^{(k,2)} - b^{(k,1)}} = c,
$$

where $$c = H_{sig}(\tilde{X}, R, m)$$, $$R = \prod_{k=1}^q R_1^{(k)}$$, and $$m$$ is any message we wish to create a forgery for. This gives us that

$$
\sum_{k=1}^q s_1^{(k)} + \frac{-b^{(k,1)}}{b^{(k,2)} - b^{(k,1)}}(s_2^{(k)} - s_1^{(k)}) = \left(\sum_{k=1}^q r_1^{(k)}\right) + c\cdot a_1\cdot x_1 = r  + c\cdot a_1\cdot x_1.
$$

Finally, we can turn this into a valid signature of the message $$m$$ for the aggregate key $$\tilde{X}$$ by adding in $$c\cdot a_2\cdot x_2$$.

In summary,

### Algorithm $$\mathcal{A}(X_1, x_2, m)$$:
1. Open 256 signing sessions, receiving $$(R_1^{(k)}, R_2^{(k)})_{1\leq k\leq 256}$$.
2. Set $$R := \prod_{k=1}^{256}R_1^{(k)}$$. (Note that there is a variant of this attack where one of these is given a uniformly random coefficient to make $$R$$ uniformly random, if desired).
3. Set $$c := H_{sig}(\tilde{X}, R, m)$$.
4. For each $$1\leq k\leq 256$$, choose random values $$R_{1,k,1}, R_{2,k,1}, R_{1,k,2}, m_{k,1}$$, and $$m_{k,2}$$, and let $$R_{2,k,2}$$ be a variable. For $$j\in\{1,2\}$$ define $$b^{(k,j)} := H_{non}(\tilde{X}, (R_{j,k,1}, R_{j,k,2}), m_{k,j})$$ and $$c^{(k,j)} := H_{sig}(\tilde{X}, R_{j,k,1}R_{j,k,2}^{b^{(k,j)}}, m_{k,j})$$, where these are constants for $$j=1$$ and both depend on $$R_{2,k,2}$$ for $$j=2$$. Define $$\beta_{k} = c^{(k,1)} - \frac{b^{(k,1)}}{b^{(k,2)} - b^{(k,1)}}(c^{(k,2)}-c^{(k,1)})$$, which is uniformly random as $$R_{2,k,2}$$ varies. Run Wagner's Algorithm to find values of $$R_{2,k,2}$$ such that $$\sum_{k=1}^{256}\beta_k = c$$. (This requires about $$256\cdot 2^{\frac{256}{1 + \log_2(256)}} \approx 2^{37}$$ operations).
5. Run second round signing queries using the values $$R_{1,k,1}, R_{2,k,1}, R_{1,k,2}, m_{k,1}$$ and $$m_{k,2}$$, and the $$R_{2,k,2}$$ chosen by Wagner's Algorithm in the last step. We receive the partial signatures $$(s_1^{(k)}, s_2^{(k)})_{1\leq k\leq 256}$$.
6. Set $$s := c\cdot a_2\cdot x_2 + \sum_{k=1}^{256}s_1^{(k)} - \frac{b^{(k,1)}}{b^{(k,2)} - b^{(k,1)}}(s_2^{(k)} - s_1^{(k)})$$.
7. Return the forgery $$(R, s)$$.

To see that the forgery is valid, first note that

$$g^{s_j^{(k)}} = R_1^{(k)}(R_2^{(k)})^{b^{(k,j)}}X_1^{c^{(k,j)\cdot a_1}}$$

so that

$$g^{s_2^{(k)} - s_1^{(k)}} = (R_2^{(k)})^{b^{(k,2)} - b^{(k,1)}}X_1^{(c^{(k,2)} - c^{(k,1)})a_1}$$

and further

$$(g^{s_2^{(k)} - s_1^{(k)}})^{\frac{-b^{(k,1)}}{b^{(k,2)} - b^{(k,1)}}} = (R_2^{(k)})^{-b^{(k,1)}}X_1^{(\beta_k - c^{(k,1)})a_1}.$$

Therefore,

$$
\begin{align}
g^s &= g^{c\cdot a_2\cdot x_2}\prod_{k=1}^{256}g^{s_1^{(k)}}(g^{s_2^{(k)}-s_1^{(k)}})^{\frac{-b^{(k,1)}}{b^{(k,2)} - b^{(k,1)}}}\\
&= g^{c\cdot a_2\cdot x_2}\prod_{k=1}^{256}R_1^{(k)}(R_2^{(k)})^{b^{(k,1)}}X_1^{c^{(k,1)}\cdot a_1}(R_2^{(k)})^{-b^{(k,1)}}X_1^{\beta_k \cdot a_1 - c^{(k,1)}\cdot a_1}\\
&= g^{c\cdot a_2\cdot x_2}\prod_{k=1}^{256}R_1^{(k)}X_1^{\beta_k\cdot a_1}\\
&= g^{c\cdot a_2\cdot x_2}RX_1^{c\cdot a_1}\\
&= R(X_1^{a_1}X_2^{a_2})^c\\
&= R\tilde{X}^c.
\end{align}
$$

For brevity we don't describe more general variants of this attack here, but you may want to be aware that there are variants of this attack for any number of parties, and that a similar attack also works in the [nested setting](/publication/2026-02-12-nested-musig2).

## Consequences

This attack shows that although you don't trivially leak your private key after a single nonce reuse in MuSig2, it is still definitely insecure to reuse nonces in any capacity within MuSig2 (contrary to the claim that I was able to convince Gemini Pro 3.1 of, that it is okay to reuse private keys just once). I also believe that this concrete attack can be used to make what is being argued in the MuSig2 AGM security proof easier to understand, and I plan to work on writing up a version of this proof that incorporates this perspective to make it more accessible.

Furthermore, this attack also shows that naive approaches to turning MuSig2 into a threshold signature scheme using [replicated secret sharing](/blog/some-secrets-shared) are fraught. Namely, if you attempt to naively use replicated secret sharing on the MuSig2 nonce (say, by following [this proposal](https://gist.github.com/yannickseurin/c5a76b7180102219c77d4b63fe387445#the-case-f1) and trying to naively use it alongside [BIP 327](https://github.com/bitcoin/bips/blob/master/bip-0327.mediawiki) without making some important alterations), then you run into a problem where some nonce contributions are deterministically replicated between many signers, and you can cause those signers to use that same nonce to produce partial signatures for multiple different signature hashes, effectively causing nonce reuse allowing the above attack to be used. To be specific, if the adversary controls some number of corrupt participants (e.g. one corrupt party in a 2-of-3), and there is more than one honest participant, then they can form two different signing quorums (unbeknownst to the honest signers), where the honest parties are using the same nonce between the two different quorums but different partial signatures are produced by honest signers in each.