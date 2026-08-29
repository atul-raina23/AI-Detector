# Git Merge vs. Git Rebase — Master Teaching Guide & Live Walkthrough

This guide is designed for instructors to teach and demonstrate **Git Merge**, **Git Rebase**, and **Interactive Rebase** with real examples, ASCII branch diagrams, and step-by-step terminal commands.

---

## 1. High-Level Concept: Merge vs. Rebase

| Concept | `git merge` | `git rebase` |
| :--- | :--- | :--- |
| **Philosophy** | **Preserve exact history** as it happened chronologically. | **Rewrite history** to create a clean, linear progression. |
| **New Commits** | Creates a new **Merge Commit** (unless fast-forwarded). | **Replays** existing commits on top of the new base (new commit hashes/SHAs). |
| **Commit Hashes** | Original commit hashes stay untouched. | Commit hashes change because their parent commit changes. |
| **Conflict Resolution** | Resolved **once** in the merge commit. | Resolved **commit-by-commit** as each commit is replayed. |
| **Best Used For** | Merging feature branches into `main`/`development` (shared history). | Updating your local feature branch with the latest `main`/`dev` before merging, or cleaning local commits. |
| **Golden Rule** | Safe on any branch. | **NEVER rebase commits that have been pushed to a shared public branch!** |

---

## 2. Visual Branch Comparison

### Initial State (Diverged Branches)
```
          C1 --- C2  (feature)
         /
--- A --- B  (main)
```

---

### Option A: `git merge main` (while on `feature`)
Git creates a new 3-way merge commit `M` that has two parent commits (`B` and `C2`).

```
          C1 --- C2 --- M  (feature)
         /             /
--- A --- B -----------   (main)
```
- **Pros**: Non-destructive, complete true chronological audit trail.
- **Cons**: Branch graph can become cluttered ("railroad tracks" / "diamond graphs").

---

### Option B: `git rebase main` (while on `feature`)
Git temporarily shelves `C1` and `C2`, moves the base of `feature` to `B`, and replays `C1'` and `C2'` on top of `B`.

```
--- A --- B (main) --- C1' --- C2'  (feature)
```
*(Notice `C1'` and `C2'` have new commit hashes!)*

- **Pros**: Perfectly linear, clean `git log`, easy to `git bisect`.
- **Cons**: Rewrites commit history; can require multiple conflict resolutions if commits conflict.

---

## 3. Real-World Hands-On Demos (Live with Students)

Here are 3 concrete exercises you can run live on this repository or a demo workspace:

---

### Exercise 1: Standard 3-Way Merge (`git merge`)

**Objective:** Show students how a merge commit binds two branches together with two parents.

```bash
# 1. Start from development branch
git checkout development

# 2. Create a new demo feature branch
git checkout -b feature/search-filter

# 3. Make a commit on the feature branch
echo "export const searchFilter = () => {};" > git-tutorial-demo/search.ts
git add git-tutorial-demo/search.ts
git commit -m "feat(search): implement search filter helper"

# 4. Switch back to development and make an independent commit
git checkout development
echo "export const formatCurrency = () => {};" > git-tutorial-demo/currency.ts
git add git-tutorial-demo/currency.ts
git commit -m "feat(utils): add currency formatting utility"

# 5. Merge feature into development (with explicit merge commit)
git merge --no-ff feature/search-filter -m "merge: integrate search-filter feature"

# 6. Inspect the graph with students:
git log --graph --oneline -n 6
```

**What to highlight to students:**
- Point out the `|\` and `|/` visual fork and join.
- Run `git cat-file -p HEAD` to show that the merge commit has **two `parent` fields**.

---

### Exercise 2: Linear History with `git rebase`

**Objective:** Show students how rebasing moves your commits to the tip of the target branch.

```bash
# 1. Create a new feature branch from an older point
git checkout -b feature/export-csv development~2

# 2. Make two quick commits on the feature branch
echo "export const exportToCSV = () => {};" > git-tutorial-demo/csv.ts
git add git-tutorial-demo/csv.ts
git commit -m "feat(export): initial CSV parser"

echo "// add header row" >> git-tutorial-demo/csv.ts
git add git-tutorial-demo/csv.ts
git commit -m "feat(export): support header row in CSV"

# 3. View the diverged state before rebasing
git log --graph --oneline -n 6

# 4. Rebase feature/export-csv onto development
git rebase development

# 5. Inspect the graph again:
git log --graph --oneline -n 6
```

**What to highlight to students:**
- The commits `feat(export)` now sit directly on top of `development`.
- The graph is 100% straight and linear.
- Note how the commit timestamps / SHAs have changed.

---

### Exercise 3: Interactive Rebase (`git rebase -i`) — Squashing "WIP" Commits

**Objective:** Teach students how professional teams clean up messy local commits before raising a PR.

```bash
# 1. Make 3 messy/draft commits on a branch
git checkout -b feature/profile-badge
echo "badge v1" > git-tutorial-demo/badge.txt && git commit -am "wip: start badge"
echo "badge v2 fix typo" >> git-tutorial-demo/badge.txt && git commit -am "fix typo in badge"
echo "badge v3 final styling" >> git-tutorial-demo/badge.txt && git commit -am "add final badge styling"

# 2. Open interactive rebase for the last 3 commits:
git rebase -i HEAD~3
```

**Editor Menu to Explain to Students:**
```text
pick 1a2b3c4 wip: start badge
squash 2b3c4d5 fix typo in badge
squash 3c4d5e6 add final badge styling

# Commands:
# p, pick = use commit
# r, reword = use commit, but edit the commit message
# e, edit = use commit, but stop for amending
# s, squash = meld into previous commit
# f, fixup = like "squash", but discard this commit's log message
# d, drop = remove commit
```

**What to highlight to students:**
- Changing `pick` to `squash` (or `s`) collapses the 3 messy commits into 1 clean commit.
- Changing `pick` to `reword` allows fixing commit messages without changing code.
- Reordering lines changes the commit order.

---

## 4. Conflict Resolution: Merge vs. Rebase

### When Conflicts Occur in `git merge`:
1. Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) appear in affected files.
2. Developer resolves conflict in editor.
3. Developer runs:
   ```bash
   git add <resolved-files>
   git commit -m "merge: resolve conflicts with development"
   ```
4. Done! Conflict is resolved once.

### When Conflicts Occur in `git rebase`:
1. Rebase pauses at the exact commit that conflicts.
2. Developer resolves conflict in editor.
3. Developer runs:
   ```bash
   git add <resolved-files>
   git rebase --continue
   ```
   *(Note: Do NOT run `git commit` during a rebase!)*
4. If another replayed commit also conflicts, repeat until all commits are replayed.
5. If something goes wrong, students can safely abort with:
   ```bash
   git rebase --abort
   ```

---

## 5. Summary Cheat Sheet for Students

| When should I use **Merge**? | When should I use **Rebase**? |
| :--- | :--- |
| Pulling shared branches (`main`, `development`) | Pulling latest changes into your private local branch |
| Preserving team history and release milestones | Cleaning up messy local commits before submitting a PR |
| Working on public/shared team branches | Keeping a single clean linear history across your repository |
