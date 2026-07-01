% decisions.pl — descriptive axioms (Tier 1). What the project IS.
% Asserted ground truth from .specify/memory/constitution.md (v1.1.0).
% Compared against observed reality by `faim check` (consistency pass).

entity(project, project).
prop(project, language, typescript).
prop(project, architecture, single_package_fullstack).
prop(project, storage, postgres).
prop(project, orm, prisma).
prop(project, runtime, node24).
prop(project, realtime, sse).
prop(project, summary, 'Team Lunch coordinates office lunch decisions: poll menus, pick a winner, collect food orders, and improve recommendations from history.').
prop(project, primary_goal, 'Help authenticated office users decide and order lunch with retained history for analytics and recommendation learning.').

% --- product blueprint ---
entity(admin_user, actor).
prop(admin_user, summary, 'Approves users and manages local accounts, access, menus, and operational setup.').

entity(approved_user, actor).
prop(approved_user, summary, 'Authenticated team member who votes in polls, places food orders, sets preferences, and receives recommendations.').

entity(auth_system, actor).
prop(auth_system, summary, 'Backend session and access-control boundary for local and Entra-authenticated users.').

entity(polls, domain).
prop(polls, summary, 'Menu voting phase that determines the restaurant/menu winner or a tie needing resolution.').

entity(menus, domain).
prop(menus, summary, 'Imported or manually managed restaurant menus and menu items.').

entity(food_selections, domain).
prop(food_selections, summary, 'Post-poll ordering phase where users submit line-item lunch orders for the winning menu.').

entity(recommendations, domain).
prop(recommendations, summary, 'Meal ranking and explanation layer using preferences, allergies, ratings, order history, and optional AI wording.').

entity(auth_access, domain).
prop(auth_access, summary, 'Authentication, approval, session versioning, roles, and audit history.').

entity(lunch_decision_flow, workflow).
prop(lunch_decision_flow, summary, 'Poll menus, finish or resolve tie, open food selection, collect orders, then retain outcomes for future recommendations.').
prop(lunch_decision_flow, stateful, true).

entity(menu_polling, workflow).
prop(menu_polling, summary, 'Users vote on available menus until one wins or the poll ties.').
prop(menu_polling, stateful, true).

entity(food_ordering, workflow).
prop(food_ordering, summary, 'Users order line items from the winning menu before the food-selection timer closes.').
prop(food_ordering, stateful, true).

entity(meal_recommendation, workflow).
prop(meal_recommendation, summary, 'System scores current menu items for a user and persists recommendation impressions for learning/audit.').
prop(meal_recommendation, stateful, true).

rel(lunch_decision_flow, uses, polls).
rel(lunch_decision_flow, uses, menus).
rel(lunch_decision_flow, uses, food_selections).
rel(lunch_decision_flow, uses, recommendations).
rel(lunch_decision_flow, uses, auth_access).
rel(menu_polling, precedes, food_ordering).
rel(food_ordering, precedes, meal_recommendation).
rel(admin_user, owns, auth_access).
rel(admin_user, owns, menus).
rel(approved_user, participates_in, menu_polling).
rel(approved_user, participates_in, food_ordering).
rel(approved_user, participates_in, meal_recommendation).
rel(auth_system, participates_in, lunch_decision_flow).
