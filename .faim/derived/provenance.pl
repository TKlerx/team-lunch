% provenance.pl — Tier 2 trust layer. One group per derived fact.
% Kept separate so structure.pl stays readable.
%
% derived_from(Fact, Source).        Source: scanner_scan | agent_scan | user_attested
% source_files(Fact, [Path, ...]).   EVERY file consulted — completeness = trust.
% source_hash(Fact, Sha256).         content hash for cheap staleness detection
% derivation_query(Fact, Question).  the question answered (re-derivation key)
% derived_at(Fact, Timestamp, Agent).
%
% Example:
% derived_from(prop('/abc', requires_auth, true), agent_scan).
% source_files(prop('/abc', requires_auth, true), ['src/routes/abc.rs']).
% source_hash(prop('/abc', requires_auth, true), 'sha256:...').
% derivation_query(prop('/abc', requires_auth, true), 'does /abc require auth').
derived_from(entity(mealRecommendation,service), agent_scan).
source_files(entity(mealRecommendation,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(mealRecommendation,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(mealRecommendation,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(mealRecommendation,service), '2026-06-24T05:07:35Z', agent).
derived_from(entity(mealRecommendationModel,service), agent_scan).
source_files(entity(mealRecommendationModel,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(mealRecommendationModel,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(mealRecommendationModel,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(mealRecommendationModel,service), '2026-06-24T05:07:35Z', agent).
derived_from(entity(mealRecommendationAi,service), agent_scan).
source_files(entity(mealRecommendationAi,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(mealRecommendationAi,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(mealRecommendationAi,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(mealRecommendationAi,service), '2026-06-24T05:07:35Z', agent).
derived_from(entity(mealRecommendationEval,service), agent_scan).
source_files(entity(mealRecommendationEval,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(mealRecommendationEval,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(mealRecommendationEval,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(mealRecommendationEval,service), '2026-06-24T05:07:36Z', agent).
derived_from(entity(mealFeatures,service), agent_scan).
source_files(entity(mealFeatures,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(mealFeatures,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(mealFeatures,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(mealFeatures,service), '2026-06-24T05:07:36Z', agent).
derived_from(entity(mealItemIdentity,service), agent_scan).
source_files(entity(mealItemIdentity,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(mealItemIdentity,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(mealItemIdentity,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(mealItemIdentity,service), '2026-06-24T05:07:36Z', agent).
derived_from(entity(officeRecommenderSettings,service), agent_scan).
source_files(entity(officeRecommenderSettings,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(officeRecommenderSettings,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(officeRecommenderSettings,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(officeRecommenderSettings,service), '2026-06-24T05:07:36Z', agent).
derived_from(entity(userPreferences,service), agent_scan).
source_files(entity(userPreferences,service), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(userPreferences,service), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(userPreferences,service), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(userPreferences,service), '2026-06-24T05:07:37Z', agent).
derived_from(entity(db,module), agent_scan).
source_files(entity(db,module), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(db,module), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(db,module), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(db,module), '2026-06-24T05:07:37Z', agent).
derived_from(entity(lib_types,module), agent_scan).
source_files(entity(lib_types,module), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(lib_types,module), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(lib_types,module), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(lib_types,module), '2026-06-24T05:07:37Z', agent).
derived_from(entity(routeUtils,module), agent_scan).
source_files(entity(routeUtils,module), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(routeUtils,module), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(routeUtils,module), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(routeUtils,module), '2026-06-24T05:07:37Z', agent).
derived_from(entity(authIdentity,module), agent_scan).
source_files(entity(authIdentity,module), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(authIdentity,module), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(authIdentity,module), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(authIdentity,module), '2026-06-24T05:07:38Z', agent).
derived_from(entity(recommenderAdmin,route), agent_scan).
source_files(entity(recommenderAdmin,route), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(entity(recommenderAdmin,route), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(entity(recommenderAdmin,route), "recommender feature dependency spine for blast-radius queries").
derived_at(entity(recommenderAdmin,route), '2026-06-24T05:07:38Z', agent).
derived_from(rel(mealRecommendation,depends_on,db), agent_scan).
source_files(rel(mealRecommendation,depends_on,db), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,db), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,db), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,db), '2026-06-24T05:07:38Z', agent).
derived_from(rel(mealRecommendation,depends_on,mealRecommendationAi), agent_scan).
source_files(rel(mealRecommendation,depends_on,mealRecommendationAi), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,mealRecommendationAi), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,mealRecommendationAi), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,mealRecommendationAi), '2026-06-24T05:07:38Z', agent).
derived_from(rel(mealRecommendation,depends_on,mealFeatures), agent_scan).
source_files(rel(mealRecommendation,depends_on,mealFeatures), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,mealFeatures), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,mealFeatures), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,mealFeatures), '2026-06-24T05:07:39Z', agent).
derived_from(rel(mealRecommendation,depends_on,mealRecommendationModel), agent_scan).
source_files(rel(mealRecommendation,depends_on,mealRecommendationModel), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,mealRecommendationModel), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,mealRecommendationModel), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,mealRecommendationModel), '2026-06-24T05:07:39Z', agent).
derived_from(rel(mealRecommendation,depends_on,mealItemIdentity), agent_scan).
source_files(rel(mealRecommendation,depends_on,mealItemIdentity), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,mealItemIdentity), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,mealItemIdentity), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,mealItemIdentity), '2026-06-24T05:07:39Z', agent).
derived_from(rel(mealRecommendation,depends_on,userPreferences), agent_scan).
source_files(rel(mealRecommendation,depends_on,userPreferences), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,userPreferences), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,userPreferences), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,userPreferences), '2026-06-24T05:07:39Z', agent).
derived_from(rel(mealRecommendation,depends_on,lib_types), agent_scan).
source_files(rel(mealRecommendation,depends_on,lib_types), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(mealRecommendation,depends_on,lib_types), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(mealRecommendation,depends_on,lib_types), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(mealRecommendation,depends_on,lib_types), '2026-06-24T05:07:40Z', agent).
derived_from(rel(recommenderAdmin,depends_on,routeUtils), agent_scan).
source_files(rel(recommenderAdmin,depends_on,routeUtils), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(recommenderAdmin,depends_on,routeUtils), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(recommenderAdmin,depends_on,routeUtils), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(recommenderAdmin,depends_on,routeUtils), '2026-06-24T05:07:40Z', agent).
derived_from(rel(recommenderAdmin,depends_on,authIdentity), agent_scan).
source_files(rel(recommenderAdmin,depends_on,authIdentity), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(recommenderAdmin,depends_on,authIdentity), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(recommenderAdmin,depends_on,authIdentity), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(recommenderAdmin,depends_on,authIdentity), '2026-06-24T05:07:40Z', agent).
derived_from(rel(recommenderAdmin,depends_on,mealRecommendationEval), agent_scan).
source_files(rel(recommenderAdmin,depends_on,mealRecommendationEval), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(recommenderAdmin,depends_on,mealRecommendationEval), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(recommenderAdmin,depends_on,mealRecommendationEval), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(recommenderAdmin,depends_on,mealRecommendationEval), '2026-06-24T05:07:40Z', agent).
derived_from(rel(recommenderAdmin,depends_on,officeRecommenderSettings), agent_scan).
source_files(rel(recommenderAdmin,depends_on,officeRecommenderSettings), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(recommenderAdmin,depends_on,officeRecommenderSettings), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(recommenderAdmin,depends_on,officeRecommenderSettings), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(recommenderAdmin,depends_on,officeRecommenderSettings), '2026-06-24T05:07:40Z', agent).
derived_from(rel(recommenderAdmin,depends_on,mealRecommendationModel), agent_scan).
source_files(rel(recommenderAdmin,depends_on,mealRecommendationModel), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(recommenderAdmin,depends_on,mealRecommendationModel), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(recommenderAdmin,depends_on,mealRecommendationModel), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(recommenderAdmin,depends_on,mealRecommendationModel), '2026-06-24T05:07:41Z', agent).
derived_from(rel(recommenderAdmin,depends_on,lib_types), agent_scan).
source_files(rel(recommenderAdmin,depends_on,lib_types), ['src/server/services/mealRecommendation.ts', 'src/server/routes/recommenderAdmin.ts']).
source_hash(rel(recommenderAdmin,depends_on,lib_types), 'sha256:571e9c41161a653f75763d59e5cc5db19d358e256a0e148978259ca9ae5256e9').
derivation_query(rel(recommenderAdmin,depends_on,lib_types), "recommender feature dependency spine for blast-radius queries").
derived_at(rel(recommenderAdmin,depends_on,lib_types), '2026-06-24T05:07:41Z', agent).
derived_from(entity('POST:/api/menus',endpoint), agent_scan).
source_files(entity('POST:/api/menus',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('POST:/api/menus',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('POST:/api/menus',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('POST:/api/menus',endpoint), '2026-06-24T05:26:54Z', agent).
derived_from(prop('POST:/api/menus',method,post), agent_scan).
source_files(prop('POST:/api/menus',method,post), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus',method,post), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus',method,post), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus',method,post), '2026-06-24T05:26:55Z', agent).
derived_from(prop('POST:/api/menus',path,'/api/menus'), agent_scan).
source_files(prop('POST:/api/menus',path,'/api/menus'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus',path,'/api/menus'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus',path,'/api/menus'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus',path,'/api/menus'), '2026-06-24T05:26:55Z', agent).
derived_from(prop('POST:/api/menus',mutates_state,true), agent_scan).
source_files(prop('POST:/api/menus',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus',mutates_state,true), '2026-06-24T05:26:55Z', agent).
derived_from(entity('POST:/api/menus/import',endpoint), agent_scan).
source_files(entity('POST:/api/menus/import',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('POST:/api/menus/import',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('POST:/api/menus/import',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('POST:/api/menus/import',endpoint), '2026-06-24T05:26:56Z', agent).
derived_from(prop('POST:/api/menus/import',method,post), agent_scan).
source_files(prop('POST:/api/menus/import',method,post), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/import',method,post), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus/import',method,post), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus/import',method,post), '2026-06-24T05:26:56Z', agent).
derived_from(prop('POST:/api/menus/import',path,'/api/menus/import'), agent_scan).
source_files(prop('POST:/api/menus/import',path,'/api/menus/import'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/import',path,'/api/menus/import'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus/import',path,'/api/menus/import'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus/import',path,'/api/menus/import'), '2026-06-24T05:26:56Z', agent).
derived_from(prop('POST:/api/menus/import',mutates_state,true), agent_scan).
source_files(prop('POST:/api/menus/import',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/import',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus/import',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus/import',mutates_state,true), '2026-06-24T05:26:57Z', agent).
derived_from(entity('PUT:/api/menus/:id',endpoint), agent_scan).
source_files(entity('PUT:/api/menus/:id',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('PUT:/api/menus/:id',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('PUT:/api/menus/:id',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('PUT:/api/menus/:id',endpoint), '2026-06-24T05:26:57Z', agent).
derived_from(prop('PUT:/api/menus/:id',method,put), agent_scan).
source_files(prop('PUT:/api/menus/:id',method,put), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:id',method,put), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('PUT:/api/menus/:id',method,put), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('PUT:/api/menus/:id',method,put), '2026-06-24T05:26:57Z', agent).
derived_from(prop('PUT:/api/menus/:id',path,'/api/menus/:id'), agent_scan).
source_files(prop('PUT:/api/menus/:id',path,'/api/menus/:id'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:id',path,'/api/menus/:id'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('PUT:/api/menus/:id',path,'/api/menus/:id'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('PUT:/api/menus/:id',path,'/api/menus/:id'), '2026-06-24T05:26:58Z', agent).
derived_from(prop('PUT:/api/menus/:id',mutates_state,true), agent_scan).
source_files(prop('PUT:/api/menus/:id',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:id',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('PUT:/api/menus/:id',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('PUT:/api/menus/:id',mutates_state,true), '2026-06-24T05:26:58Z', agent).
derived_from(entity('DELETE:/api/menus/:id',endpoint), agent_scan).
source_files(entity('DELETE:/api/menus/:id',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('DELETE:/api/menus/:id',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('DELETE:/api/menus/:id',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('DELETE:/api/menus/:id',endpoint), '2026-06-24T05:26:59Z', agent).
derived_from(prop('DELETE:/api/menus/:id',method,delete), agent_scan).
source_files(prop('DELETE:/api/menus/:id',method,delete), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:id',method,delete), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('DELETE:/api/menus/:id',method,delete), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('DELETE:/api/menus/:id',method,delete), '2026-06-24T05:26:59Z', agent).
derived_from(prop('DELETE:/api/menus/:id',path,'/api/menus/:id'), agent_scan).
source_files(prop('DELETE:/api/menus/:id',path,'/api/menus/:id'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:id',path,'/api/menus/:id'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('DELETE:/api/menus/:id',path,'/api/menus/:id'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('DELETE:/api/menus/:id',path,'/api/menus/:id'), '2026-06-24T05:26:59Z', agent).
derived_from(prop('DELETE:/api/menus/:id',mutates_state,true), agent_scan).
source_files(prop('DELETE:/api/menus/:id',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:id',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('DELETE:/api/menus/:id',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('DELETE:/api/menus/:id',mutates_state,true), '2026-06-24T05:26:59Z', agent).
derived_from(entity('POST:/api/menus/:menuId/items',endpoint), agent_scan).
source_files(entity('POST:/api/menus/:menuId/items',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('POST:/api/menus/:menuId/items',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('POST:/api/menus/:menuId/items',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('POST:/api/menus/:menuId/items',endpoint), '2026-06-24T05:27:00Z', agent).
derived_from(prop('POST:/api/menus/:menuId/items',method,post), agent_scan).
source_files(prop('POST:/api/menus/:menuId/items',method,post), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/:menuId/items',method,post), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus/:menuId/items',method,post), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus/:menuId/items',method,post), '2026-06-24T05:27:00Z', agent).
derived_from(prop('POST:/api/menus/:menuId/items',path,'/api/menus/:menuId/items'), agent_scan).
source_files(prop('POST:/api/menus/:menuId/items',path,'/api/menus/:menuId/items'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/:menuId/items',path,'/api/menus/:menuId/items'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus/:menuId/items',path,'/api/menus/:menuId/items'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus/:menuId/items',path,'/api/menus/:menuId/items'), '2026-06-24T05:27:01Z', agent).
derived_from(prop('POST:/api/menus/:menuId/items',mutates_state,true), agent_scan).
source_files(prop('POST:/api/menus/:menuId/items',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/:menuId/items',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('POST:/api/menus/:menuId/items',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('POST:/api/menus/:menuId/items',mutates_state,true), '2026-06-24T05:27:01Z', agent).
derived_from(entity('PUT:/api/menus/:menuId/items/:id',endpoint), agent_scan).
source_files(entity('PUT:/api/menus/:menuId/items/:id',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('PUT:/api/menus/:menuId/items/:id',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('PUT:/api/menus/:menuId/items/:id',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('PUT:/api/menus/:menuId/items/:id',endpoint), '2026-06-24T05:27:01Z', agent).
derived_from(prop('PUT:/api/menus/:menuId/items/:id',method,put), agent_scan).
source_files(prop('PUT:/api/menus/:menuId/items/:id',method,put), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:menuId/items/:id',method,put), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('PUT:/api/menus/:menuId/items/:id',method,put), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('PUT:/api/menus/:menuId/items/:id',method,put), '2026-06-24T05:27:02Z', agent).
derived_from(prop('PUT:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), agent_scan).
source_files(prop('PUT:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('PUT:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('PUT:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), '2026-06-24T05:27:02Z', agent).
derived_from(prop('PUT:/api/menus/:menuId/items/:id',mutates_state,true), agent_scan).
source_files(prop('PUT:/api/menus/:menuId/items/:id',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:menuId/items/:id',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('PUT:/api/menus/:menuId/items/:id',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('PUT:/api/menus/:menuId/items/:id',mutates_state,true), '2026-06-24T05:27:02Z', agent).
derived_from(entity('DELETE:/api/menus/:menuId/items/:id',endpoint), agent_scan).
source_files(entity('DELETE:/api/menus/:menuId/items/:id',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('DELETE:/api/menus/:menuId/items/:id',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('DELETE:/api/menus/:menuId/items/:id',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('DELETE:/api/menus/:menuId/items/:id',endpoint), '2026-06-24T05:27:03Z', agent).
derived_from(prop('DELETE:/api/menus/:menuId/items/:id',method,delete), agent_scan).
source_files(prop('DELETE:/api/menus/:menuId/items/:id',method,delete), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:menuId/items/:id',method,delete), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('DELETE:/api/menus/:menuId/items/:id',method,delete), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('DELETE:/api/menus/:menuId/items/:id',method,delete), '2026-06-24T05:27:03Z', agent).
derived_from(prop('DELETE:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), agent_scan).
source_files(prop('DELETE:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('DELETE:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('DELETE:/api/menus/:menuId/items/:id',path,'/api/menus/:menuId/items/:id'), '2026-06-24T05:27:03Z', agent).
derived_from(prop('DELETE:/api/menus/:menuId/items/:id',mutates_state,true), agent_scan).
source_files(prop('DELETE:/api/menus/:menuId/items/:id',mutates_state,true), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:menuId/items/:id',mutates_state,true), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('DELETE:/api/menus/:menuId/items/:id',mutates_state,true), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('DELETE:/api/menus/:menuId/items/:id',mutates_state,true), '2026-06-24T05:27:04Z', agent).
derived_from(entity('GET:/api/menus',endpoint), agent_scan).
source_files(entity('GET:/api/menus',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/menus',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/menus',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/menus',endpoint), '2026-06-24T05:27:04Z', agent).
derived_from(prop('GET:/api/menus',method,get), agent_scan).
source_files(prop('GET:/api/menus',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/menus',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/menus',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/menus',method,get), '2026-06-24T05:27:05Z', agent).
derived_from(prop('GET:/api/menus',path,'/api/menus'), agent_scan).
source_files(prop('GET:/api/menus',path,'/api/menus'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/menus',path,'/api/menus'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/menus',path,'/api/menus'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/menus',path,'/api/menus'), '2026-06-24T05:27:05Z', agent).
derived_from(prop('GET:/api/menus',mutates_state,false), agent_scan).
source_files(prop('GET:/api/menus',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/menus',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/menus',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/menus',mutates_state,false), '2026-06-24T05:27:05Z', agent).
derived_from(entity('GET:/api/food-selections/active',endpoint), agent_scan).
source_files(entity('GET:/api/food-selections/active',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/food-selections/active',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/food-selections/active',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/food-selections/active',endpoint), '2026-06-24T05:27:06Z', agent).
derived_from(prop('GET:/api/food-selections/active',method,get), agent_scan).
source_files(prop('GET:/api/food-selections/active',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/active',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/active',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/active',method,get), '2026-06-24T05:27:06Z', agent).
derived_from(prop('GET:/api/food-selections/active',path,'/api/food-selections/active'), agent_scan).
source_files(prop('GET:/api/food-selections/active',path,'/api/food-selections/active'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/active',path,'/api/food-selections/active'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/active',path,'/api/food-selections/active'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/active',path,'/api/food-selections/active'), '2026-06-24T05:27:06Z', agent).
derived_from(prop('GET:/api/food-selections/active',mutates_state,false), agent_scan).
source_files(prop('GET:/api/food-selections/active',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/active',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/active',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/active',mutates_state,false), '2026-06-24T05:27:07Z', agent).
derived_from(entity('GET:/api/food-selections/history',endpoint), agent_scan).
source_files(entity('GET:/api/food-selections/history',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/food-selections/history',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/food-selections/history',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/food-selections/history',endpoint), '2026-06-24T05:27:07Z', agent).
derived_from(prop('GET:/api/food-selections/history',method,get), agent_scan).
source_files(prop('GET:/api/food-selections/history',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/history',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/history',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/history',method,get), '2026-06-24T05:27:07Z', agent).
derived_from(prop('GET:/api/food-selections/history',path,'/api/food-selections/history'), agent_scan).
source_files(prop('GET:/api/food-selections/history',path,'/api/food-selections/history'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/history',path,'/api/food-selections/history'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/history',path,'/api/food-selections/history'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/history',path,'/api/food-selections/history'), '2026-06-24T05:27:08Z', agent).
derived_from(prop('GET:/api/food-selections/history',mutates_state,false), agent_scan).
source_files(prop('GET:/api/food-selections/history',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/history',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/history',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/history',mutates_state,false), '2026-06-24T05:27:08Z', agent).
derived_from(entity('GET:/api/food-selections/:id/fallback-candidates',endpoint), agent_scan).
source_files(entity('GET:/api/food-selections/:id/fallback-candidates',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/food-selections/:id/fallback-candidates',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/food-selections/:id/fallback-candidates',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/food-selections/:id/fallback-candidates',endpoint), '2026-06-24T05:27:09Z', agent).
derived_from(prop('GET:/api/food-selections/:id/fallback-candidates',method,get), agent_scan).
source_files(prop('GET:/api/food-selections/:id/fallback-candidates',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/:id/fallback-candidates',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/:id/fallback-candidates',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/:id/fallback-candidates',method,get), '2026-06-24T05:27:09Z', agent).
derived_from(prop('GET:/api/food-selections/:id/fallback-candidates',path,'/api/food-selections/:id/fallback-candidates'), agent_scan).
source_files(prop('GET:/api/food-selections/:id/fallback-candidates',path,'/api/food-selections/:id/fallback-candidates'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/:id/fallback-candidates',path,'/api/food-selections/:id/fallback-candidates'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/:id/fallback-candidates',path,'/api/food-selections/:id/fallback-candidates'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/:id/fallback-candidates',path,'/api/food-selections/:id/fallback-candidates'), '2026-06-24T05:27:09Z', agent).
derived_from(prop('GET:/api/food-selections/:id/fallback-candidates',mutates_state,false), agent_scan).
source_files(prop('GET:/api/food-selections/:id/fallback-candidates',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/:id/fallback-candidates',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/food-selections/:id/fallback-candidates',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/food-selections/:id/fallback-candidates',mutates_state,false), '2026-06-24T05:27:09Z', agent).
derived_from(entity('GET:/api/polls/active',endpoint), agent_scan).
source_files(entity('GET:/api/polls/active',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/polls/active',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/polls/active',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/polls/active',endpoint), '2026-06-24T05:27:10Z', agent).
derived_from(prop('GET:/api/polls/active',method,get), agent_scan).
source_files(prop('GET:/api/polls/active',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/active',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/polls/active',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/polls/active',method,get), '2026-06-24T05:27:10Z', agent).
derived_from(prop('GET:/api/polls/active',path,'/api/polls/active'), agent_scan).
source_files(prop('GET:/api/polls/active',path,'/api/polls/active'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/active',path,'/api/polls/active'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/polls/active',path,'/api/polls/active'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/polls/active',path,'/api/polls/active'), '2026-06-24T05:27:11Z', agent).
derived_from(prop('GET:/api/polls/active',mutates_state,false), agent_scan).
source_files(prop('GET:/api/polls/active',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/active',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/polls/active',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/polls/active',mutates_state,false), '2026-06-24T05:27:11Z', agent).
derived_from(entity('GET:/api/polls/:id',endpoint), agent_scan).
source_files(entity('GET:/api/polls/:id',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/polls/:id',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/polls/:id',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/polls/:id',endpoint), '2026-06-24T05:27:11Z', agent).
derived_from(prop('GET:/api/polls/:id',method,get), agent_scan).
source_files(prop('GET:/api/polls/:id',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/:id',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/polls/:id',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/polls/:id',method,get), '2026-06-24T05:27:12Z', agent).
derived_from(prop('GET:/api/polls/:id',path,'/api/polls/:id'), agent_scan).
source_files(prop('GET:/api/polls/:id',path,'/api/polls/:id'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/:id',path,'/api/polls/:id'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/polls/:id',path,'/api/polls/:id'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/polls/:id',path,'/api/polls/:id'), '2026-06-24T05:27:12Z', agent).
derived_from(prop('GET:/api/polls/:id',mutates_state,false), agent_scan).
source_files(prop('GET:/api/polls/:id',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/:id',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/polls/:id',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/polls/:id',mutates_state,false), '2026-06-24T05:27:12Z', agent).
derived_from(entity('GET:/api/shopping-list',endpoint), agent_scan).
source_files(entity('GET:/api/shopping-list',endpoint), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(entity('GET:/api/shopping-list',endpoint), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(entity('GET:/api/shopping-list',endpoint), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(entity('GET:/api/shopping-list',endpoint), '2026-06-24T05:27:13Z', agent).
derived_from(prop('GET:/api/shopping-list',method,get), agent_scan).
source_files(prop('GET:/api/shopping-list',method,get), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/shopping-list',method,get), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/shopping-list',method,get), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/shopping-list',method,get), '2026-06-24T05:27:13Z', agent).
derived_from(prop('GET:/api/shopping-list',path,'/api/shopping-list'), agent_scan).
source_files(prop('GET:/api/shopping-list',path,'/api/shopping-list'), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/shopping-list',path,'/api/shopping-list'), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/shopping-list',path,'/api/shopping-list'), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/shopping-list',path,'/api/shopping-list'), '2026-06-24T05:27:13Z', agent).
derived_from(prop('GET:/api/shopping-list',mutates_state,false), agent_scan).
source_files(prop('GET:/api/shopping-list',mutates_state,false), ['src/server/routes/menus.ts', 'src/server/routes/foodSelections.ts', 'src/server/routes/polls.ts', 'src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/shopping-list',mutates_state,false), 'sha256:6a4b6000c4a49325f50014924688918ff7d87f0608235c318e7d36f813b056ed').
derivation_query(prop('GET:/api/shopping-list',mutates_state,false), "security audit: which HTTP endpoints are reachable without authentication (requires_auth=false)").
derived_at(prop('GET:/api/shopping-list',mutates_state,false), '2026-06-24T05:27:14Z', agent).
derived_from(prop('POST:/api/menus',requires_auth,true), agent_scan).
source_files(prop('POST:/api/menus',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('POST:/api/menus',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('POST:/api/menus',requires_auth,true), '2026-06-24T05:40:05Z', agent).
derived_from(prop('POST:/api/menus/import',requires_auth,true), agent_scan).
source_files(prop('POST:/api/menus/import',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/import',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('POST:/api/menus/import',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('POST:/api/menus/import',requires_auth,true), '2026-06-24T05:40:05Z', agent).
derived_from(prop('PUT:/api/menus/:id',requires_auth,true), agent_scan).
source_files(prop('PUT:/api/menus/:id',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:id',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('PUT:/api/menus/:id',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('PUT:/api/menus/:id',requires_auth,true), '2026-06-24T05:40:06Z', agent).
derived_from(prop('DELETE:/api/menus/:id',requires_auth,true), agent_scan).
source_files(prop('DELETE:/api/menus/:id',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:id',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('DELETE:/api/menus/:id',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('DELETE:/api/menus/:id',requires_auth,true), '2026-06-24T05:40:07Z', agent).
derived_from(prop('POST:/api/menus/:menuId/items',requires_auth,true), agent_scan).
source_files(prop('POST:/api/menus/:menuId/items',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('POST:/api/menus/:menuId/items',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('POST:/api/menus/:menuId/items',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('POST:/api/menus/:menuId/items',requires_auth,true), '2026-06-24T05:40:07Z', agent).
derived_from(prop('PUT:/api/menus/:menuId/items/:id',requires_auth,true), agent_scan).
source_files(prop('PUT:/api/menus/:menuId/items/:id',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('PUT:/api/menus/:menuId/items/:id',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('PUT:/api/menus/:menuId/items/:id',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('PUT:/api/menus/:menuId/items/:id',requires_auth,true), '2026-06-24T05:40:08Z', agent).
derived_from(prop('DELETE:/api/menus/:menuId/items/:id',requires_auth,true), agent_scan).
source_files(prop('DELETE:/api/menus/:menuId/items/:id',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('DELETE:/api/menus/:menuId/items/:id',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('DELETE:/api/menus/:menuId/items/:id',requires_auth,true), "security audit: menu mutations now require auth (requireAuthenticatedActor)").
derived_at(prop('DELETE:/api/menus/:menuId/items/:id',requires_auth,true), '2026-06-24T05:40:09Z', agent).
derived_from(prop('GET:/api/menus',requires_auth,true), agent_scan).
source_files(prop('GET:/api/menus',requires_auth,true), ['src/server/routes/menus.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/menus',requires_auth,true), 'sha256:51eff26a6d06fbe3f7703d91f59ba0d3202d2b99a0ea743df3f891364b5f8f9a').
derivation_query(prop('GET:/api/menus',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/menus',requires_auth,true), '2026-06-24T06:04:15Z', agent).
derived_from(prop('GET:/api/food-selections/active',requires_auth,true), agent_scan).
source_files(prop('GET:/api/food-selections/active',requires_auth,true), ['src/server/routes/foodSelections.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/active',requires_auth,true), 'sha256:0871efc794133ef18c6788d561b876ab169b07ff43989753e11c82d4cdfa4382').
derivation_query(prop('GET:/api/food-selections/active',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/food-selections/active',requires_auth,true), '2026-06-24T06:04:17Z', agent).
derived_from(prop('GET:/api/food-selections/history',requires_auth,true), agent_scan).
source_files(prop('GET:/api/food-selections/history',requires_auth,true), ['src/server/routes/foodSelections.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/history',requires_auth,true), 'sha256:0871efc794133ef18c6788d561b876ab169b07ff43989753e11c82d4cdfa4382').
derivation_query(prop('GET:/api/food-selections/history',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/food-selections/history',requires_auth,true), '2026-06-24T06:04:18Z', agent).
derived_from(prop('GET:/api/food-selections/:id/fallback-candidates',requires_auth,true), agent_scan).
source_files(prop('GET:/api/food-selections/:id/fallback-candidates',requires_auth,true), ['src/server/routes/foodSelections.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/food-selections/:id/fallback-candidates',requires_auth,true), 'sha256:0871efc794133ef18c6788d561b876ab169b07ff43989753e11c82d4cdfa4382').
derivation_query(prop('GET:/api/food-selections/:id/fallback-candidates',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/food-selections/:id/fallback-candidates',requires_auth,true), '2026-06-24T06:04:20Z', agent).
derived_from(prop('GET:/api/polls/active',requires_auth,true), agent_scan).
source_files(prop('GET:/api/polls/active',requires_auth,true), ['src/server/routes/polls.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/active',requires_auth,true), 'sha256:416e87546a7f8e99d0e8198d69eceebf9c3fdbd12c98e048a6baa4dc32154ffe').
derivation_query(prop('GET:/api/polls/active',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/polls/active',requires_auth,true), '2026-06-24T06:04:21Z', agent).
derived_from(prop('GET:/api/polls/:id',requires_auth,true), agent_scan).
source_files(prop('GET:/api/polls/:id',requires_auth,true), ['src/server/routes/polls.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/polls/:id',requires_auth,true), 'sha256:416e87546a7f8e99d0e8198d69eceebf9c3fdbd12c98e048a6baa4dc32154ffe').
derivation_query(prop('GET:/api/polls/:id',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/polls/:id',requires_auth,true), '2026-06-24T06:04:23Z', agent).
derived_from(prop('GET:/api/shopping-list',requires_auth,true), agent_scan).
source_files(prop('GET:/api/shopping-list',requires_auth,true), ['src/server/routes/shoppingList.ts', 'src/server/routes/authIdentity.ts']).
source_hash(prop('GET:/api/shopping-list',requires_auth,true), 'sha256:64d12384b0a190e70bf8ba64bfb9a790c82d9c43682928d314050b2cde5eb72c').
derivation_query(prop('GET:/api/shopping-list',requires_auth,true), "security audit: all data-read endpoints now require auth").
derived_at(prop('GET:/api/shopping-list',requires_auth,true), '2026-06-24T06:04:24Z', agent).
derived_from(entity(faim,tool), agent_scan).
source_files(entity(faim,tool), ['.faim/faim.conf']).
source_hash(entity(faim,tool), 'sha256:8ae104d29c49aabbb0962eb5d9363308620a71462df0e0aab262688e1f9a7e98').
derivation_query(entity(faim,tool), "FAIM project metadata version").
derived_at(entity(faim,tool), '2026-06-30T07:58:46Z', agent).
derived_from(prop(faim,version,'0.4.0'), agent_scan).
source_files(prop(faim,version,'0.4.0'), ['.faim/faim.conf']).
source_hash(prop(faim,version,'0.4.0'), 'sha256:8ae104d29c49aabbb0962eb5d9363308620a71462df0e0aab262688e1f9a7e98').
derivation_query(prop(faim,version,'0.4.0'), "FAIM project metadata version").
derived_at(prop(faim,version,'0.4.0'), '2026-06-30T07:58:46Z', agent).
