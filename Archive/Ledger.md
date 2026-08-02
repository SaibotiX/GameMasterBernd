
## Ledger

> The **Ledger** is the game's accounting book. It is a single list of records, each saying: *"at time T, player X gained or lost amount Y of thing Z, because R."* The list is **append-only**: the game only ever adds new lines at the end — no line is ever edited or deleted. If a mistake happens, we don't erase it; we add a *correction line*.

Why build it this way:
- **Every balance is derived.** A player's XP is not a number we overwrite; it is the *sum of their ledger lines*. The displayed value is just a cached total that can always be recomputed.
- **Everything is explainable.** "Why do I have 340 XP?" has an exact answer: these lines, these reasons. AI can narrate any player's history straight from it — and disputes are resolvable by looking.
- **Nothing is corruptible quietly.** A bug or an exploited AI can only ever *add* traceable lines, never silently rewrite history.
- **A "consequence comes from the Ledger"** means: mood and drama are theater, but you only actually lose or gain something when a ledger line is written — and lines are written only by server-checked code paths, never by chat.

Technically it is one database table (`ledger`) plus append-only siblings (`messages`, `verdicts`).

## 2. Task anatomy

Define the rules yourself, Update

## 3. Where tasks come from

Define the rules yourself, Update

### 3.2 AI-drafted tasks
Define the rules yourself, Update

## 4. Verification & scoring: strategy modules (D14)
Define the rules yourself, Update

## 5. Failure, penalties, death (D16, D17)
Define the rules yourself, Update

## 6. Keeping it honest (anti-cheating)
Define the rules yourself, Update

## 7. Data model (the tables)

Define the rules yourself, Update
