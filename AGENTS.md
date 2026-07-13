# Repository Instructions

These instructions apply to the whole repository. The notebook rules apply especially to
`notebooks/Goodreads_ML_pipeline.ipynb`, which is the shared project notebook and the main
deliverable reviewed by the professor.

## Notebook structure

- Keep code cells small and focused on one clear task. Prefer several readable cells to one
long cell that performs several unrelated operations.
- Precede every code cell with a short Markdown title that states its purpose. Add one to
three short explanatory sentences when the reason for the step is not obvious.
- Use a clear sequence: introduce the question, run the code, show a concise result, and
interpret the result before moving to the next question.
- Keep section numbering and heading levels consistent with the surrounding notebook.
- Do not hide important project logic in an import or a large helper merely to shorten the visible notebook.
- Avoid very large table outputs. Show only the rows, columns, summaries, or metrics needed
to support the discussion.



## Code style

- Prefer simple, explicit, human-readable Python, even when it is longer or less optimized
than a compact or highly abstract solution.
- Use descriptive intermediate variable names so each calculation can be followed during a
notebook review.
- Add short comments that explain the purpose of a step, a non-obvious choice, or an
important assumption. Do not comment every obvious Python operation.
- Do not use `IPython.display.display`, `display()`, or an aliased equivalent. To render one
table, leave the DataFrame or Styler as the final expression in the cell. Use clearly
labelled `print()` calls for short text or scalar results when needed.
- Avoid dense one-liners, deeply nested comprehensions, metaprogramming, and abstractions
that make the analysis harder to follow.
- Reuse an existing helper when it makes the notebook clearer, but do not create a helper
for a single short operation.
- Use named constants for values reused across the modelling workflow, including a fixed
random seed.



## Writing voice

- Write code comments and Markdown as part of a student group submission intended for the
reviewing professor. Explain the reasoning, evidence, modelling choices, and limitations
of the project itself.
- Never write from the perspective of an AI assistant speaking to a user. Do not mention a
prompt, request, agent, conversation, or generated change in notebook content.
- Prefer direct, neutral phrasing or a gerund-led sentence.
- Example: write "Keeping the best candidates for the selected model" instead of "We keep
the best candidates for the selected model."
- Prefer precise observations over vague claims. State what a table, metric, or chart shows,
then explain why it matters to the analysis.
- Keep prose concise and natural. Avoid inflated academic language, repetitive summaries,
and long paragraphs that merely restate the code.



## Analysis and modelling conventions

- Preserve the meaning of the main dataframes: `df_raw` is unchanged source data,
`df_clean` contains cleaned data, and `df_model` contains modelling or exploratory
features. Use `.copy()` when starting a new stage.
- Never silently repair, remove, or recode data. Introduce the issue in Markdown, make the
rule explicit in code, and check the result.
- Perform the train/test split before fitting encoders, imputers, scalers, feature selectors, target-derived features, or other learned transformations.
- Fit preprocessing on the training data and apply the fitted transformation separately to
validation or test data.
- Keep the test set for final evaluation. Use training data or cross-validation for model
selection and tuning.
- Use a fixed `random_state` for splits and stochastic estimators so results are reproducible.
- Compare models on the same split and with the same metrics. Explain why each reported
metric is relevant to predicting `average_rating`.
- Follow every important cleaning, feature-engineering, or modelling step with a compact
validation such as a shape, missing-value count, distribution, or metric.
- Give charts an informative title and labelled axes, including units where relevant. Add a
short Markdown interpretation after charts that support a project decision.
- Distinguish evidence from interpretation. Record uncertainty and limitations instead of
claiming that weak associations or exploratory patterns prove causation.



## Change discipline

- Preserve the existing notebook flow, variable names, and team members' work unless a
change is required for correctness or clarity.
- Make targeted edits. Do not rewrite unrelated sections or reformat the entire notebook.
- Keep paths repository-relative and do not embed local machine paths, secrets, or personal
environment details.
- When changing executable code, run the relevant cells or checks when practical and confirm
that later cells still receive the columns and variables they expect.
- Do not fabricate outputs, scores, interpretations, or conclusions. If a cell has not been
run, leave the result unstated or clearly mark it as pending execution.

