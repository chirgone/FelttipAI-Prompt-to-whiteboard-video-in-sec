# Recursion — When a Function Calls Itself

## The core idea

Recursion is a technique where a function solves a problem by calling itself
on a smaller version of the same problem. Instead of looping, the function
delegates: "I'll handle one small piece, and trust a copy of myself to handle
the rest."

Every recursive function has exactly two parts:

1. **Base case** — the smallest version of the problem, answered directly with
   no further calls. This is the exit door. Without it, the function calls
   itself forever and the program crashes with a stack overflow.
2. **Recursive case** — the function does a small amount of work, then calls
   itself with a smaller input, moving one step closer to the base case.

## A concrete example: factorial

factorial(n) means n × (n−1) × (n−2) × … × 1.

- Base case: factorial(1) = 1. We just know this.
- Recursive case: factorial(n) = n × factorial(n−1).

So factorial(4) unfolds like a chain:
factorial(4) → 4 × factorial(3) → 4 × 3 × factorial(2) → 4 × 3 × 2 × factorial(1).
When factorial(1) returns 1, the answers cascade back up:
1 → 2 → 6 → 24. The calls go **down** to the base case, and the results bubble
**back up**.

## The call stack — how the computer keeps track

Each recursive call is stacked on top of the previous one, like a pile of
plates. The computer pushes a new plate (a stack frame) for every call, and
pops one off each time a call returns. The stack grows on the way down and
shrinks on the way back up. If the base case is missing or unreachable, the
pile of plates grows until it topples — that's the famous **stack overflow**.

## A mental model: Russian nesting dolls

A recursive problem is like a set of Russian nesting dolls. You open a doll
and find a smaller identical doll inside. You keep opening smaller and smaller
dolls until you reach the tiniest solid one — the base case. Then you close
them back up in reverse order — that's the results returning.

## When to reach for recursion

Recursion shines when a problem is naturally self-similar: walking a folder
tree of directories inside directories, traversing a family tree, or
divide-and-conquer algorithms like merge sort that split a list in half, sort
each half, and merge the results.

## The takeaway

To write any recursive function, ask two questions: "What is the smallest
input I can answer immediately?" (base case) and "How do I shrink the problem
by one step?" (recursive case). Get those two right, and the function handles
problems of any size by standing on its own shoulders.
