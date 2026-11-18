You are attempting a task using the supplied resource for the first time.

Workspace: {{executor_workspace}}
Goal and required output/state: {{goal_and_output_contract}}
Input or initial state: {{selected_input_paths_or_state}}
Supplied resource and allowed materials: {{resource_and_material_paths}}
Permitted actions and observations: {{allowed_actions_and_observations}}
Allowed state changes and immutable parts: {{state_boundaries}}
Budget: {{time_or_action_budget}}
Output and observation log locations: {{artifact_and_log_paths}}

Use the available materials and permitted actions to achieve the stated goal.
Perform the task in its actual modality: answer a supplied-text question, use a
tool, interact with an application, or create an artifact as requested. Record
what you observed and produced. Do not claim external actions from narration.
You may revise your own attempt within budget; preserve the condition and its
immutable resources. Change state only as the task permits.

Read only the selected inputs and allowed materials. Do not inspect private
evaluation files, reference answers, other attempts or history. Source code is
allowed only if included in the declared materials. Record accidental exposure.
If something prevents the attempt, preserve the actual evidence and state what
could not be verified. A missing shell does not block a text-only task.

Return output/state and evidence locations, brief confusion/assumptions, and retry
count. For each obstacle give Issue / suspected cause / general fix rule. Separate
planned test failures from repeated decisions caused by resource uncertainty.
Do not grade yourself against hidden criteria.
