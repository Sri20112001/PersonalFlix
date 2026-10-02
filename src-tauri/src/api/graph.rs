use crate::api::jcol;
use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value as JValue};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(get_graph))
}

async fn get_graph(State(state): State<AppState>) -> Json<JValue> {
    let conn = state.db.lock().unwrap();

    // 1. Fetch Studios
    let mut studio_map: HashMap<String, (String, usize)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, name FROM studios ORDER BY name COLLATE NOCASE ASC")
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                ))
            })
            .unwrap();
        for r in rows.filter_map(|x| x.ok()) {
            studio_map.insert(r.0, (r.1, 0));
        }
    }

    // 2. Fetch Performers
    struct PerformerData {
        id: String,
        name: String,
        image_url: Option<String>,
        gender: Option<String>,
        country: Option<String>,
    }

    let mut performers_list: Vec<PerformerData> = Vec::new();
    let mut performer_id_set: HashMap<String, usize> = HashMap::new(); // performer_id -> index

    {
        let mut stmt = conn
            .prepare("SELECT id, name, image_url, gender, country FROM performers ORDER BY name COLLATE NOCASE ASC")
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(PerformerData {
                    id: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    image_url: r.get(2)?,
                    gender: r.get(3)?,
                    country: r.get(4)?,
                })
            })
            .unwrap();

        for p in rows.filter_map(|x| x.ok()) {
            performer_id_set.insert(p.id.clone(), performers_list.len());
            performers_list.push(p);
        }
    }

    // 3. Fetch Scenes
    struct SceneData {
        id: i64,
        title: Option<String>,
        file_name: String,
        resolution: Option<String>,
        studio_id: Option<String>,
        studio: Option<String>,
        performer_ids: Vec<String>,
        date: Option<String>,
        duration: Option<f64>,
    }

    let mut scenes_list: Vec<SceneData> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT s.id, s.title, s.file_name, s.resolution, s.studio_id, s.studio, s.performer_ids, s.date, t.duration FROM scenes s LEFT JOIN tracking t ON t.scene_id = s.id ORDER BY s.id DESC")
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                let p_ids: Vec<String> = jcol(r.get::<_, Option<String>>(6)?)
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();

                Ok(SceneData {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    file_name: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    resolution: r.get(3)?,
                    studio_id: r.get(4)?,
                    studio: r.get(5)?,
                    performer_ids: p_ids,
                    date: r.get(7)?,
                    duration: r.get(8)?,
                })
            })
            .unwrap();

        for s in rows.filter_map(|x| x.ok()) {
            // Increment studio scene count
            if let Some(ref st_id) = s.studio_id {
                if let Some(entry) = studio_map.get_mut(st_id) {
                    entry.1 += 1;
                }
            }
            scenes_list.push(s);
        }
    }

    // Track actual performer scene counts
    let mut performer_scene_counts: HashMap<String, usize> = HashMap::new();
    for s in &scenes_list {
        for pid in &s.performer_ids {
            *performer_scene_counts.entry(pid.clone()).or_insert(0) += 1;
        }
    }

    // Pre-calculate direct Co-Star relationships (Performer <-> Performer)
    let mut co_star_weights: HashMap<(String, String), usize> = HashMap::new();
    // Pre-calculate Performer <-> Studio relationships
    let mut performer_studio_weights: HashMap<(String, String), usize> = HashMap::new();

    for s in &scenes_list {
        let n_p = s.performer_ids.len();
        if n_p > 1 {
            for i in 0..n_p {
                for j in (i + 1)..n_p {
                    let p1 = &s.performer_ids[i];
                    let p2 = &s.performer_ids[j];
                    if p1 != p2 && performer_id_set.contains_key(p1) && performer_id_set.contains_key(p2) {
                        let key = if p1 < p2 {
                            (p1.clone(), p2.clone())
                        } else {
                            (p2.clone(), p1.clone())
                        };
                        *co_star_weights.entry(key).or_insert(0) += 1;
                    }
                }
            }
        }

        if let Some(ref st_id) = s.studio_id {
            if studio_map.contains_key(st_id) {
                for pid in &s.performer_ids {
                    if performer_id_set.contains_key(pid) {
                        let key = (pid.clone(), st_id.clone());
                        *performer_studio_weights.entry(key).or_insert(0) += 1;
                    }
                }
            }
        }
    }

    // Assemble Graph Nodes
    let mut nodes: Vec<JValue> = Vec::new();

    // Studio nodes
    for (st_id, (st_name, count)) in &studio_map {
        nodes.push(json!({
            "id": format!("studio-{}", st_id),
            "raw_id": st_id,
            "type": "studio",
            "name": st_name,
            "scene_count": count,
            "val": (*count as f64).sqrt().max(6.0) * 2.5
        }));
    }

    // Performer nodes
    for p in &performers_list {
        let count = performer_scene_counts.get(&p.id).copied().unwrap_or(0);
        nodes.push(json!({
            "id": format!("performer-{}", p.id),
            "raw_id": p.id,
            "type": "performer",
            "name": p.name,
            "image_url": p.image_url,
            "gender": p.gender,
            "country": p.country,
            "scene_count": count,
            "val": (count as f64).sqrt().max(4.0) * 2.0
        }));
    }

    // Scene nodes
    for s in &scenes_list {
        let title_or_file = s.title.clone().unwrap_or_else(|| s.file_name.clone());
        nodes.push(json!({
            "id": format!("scene-{}", s.id),
            "raw_id": s.id,
            "type": "scene",
            "name": title_or_file,
            "file_name": s.file_name,
            "resolution": s.resolution,
            "studio_id": s.studio_id,
            "studio": s.studio,
            "performer_ids": s.performer_ids,
            "date": s.date,
            "duration": s.duration,
            "val": 3.5
        }));
    }

    // Assemble Full Network Links (Performer <-> Scene, Studio <-> Scene)
    let mut links: Vec<JValue> = Vec::new();

    for s in &scenes_list {
        let scene_node_id = format!("scene-{}", s.id);

        // Link Studio to Scene
        if let Some(ref st_id) = s.studio_id {
            if studio_map.contains_key(st_id) {
                links.push(json!({
                    "source": format!("studio-{}", st_id),
                    "target": scene_node_id,
                    "type": "studio_scene",
                    "weight": 1
                }));
            }
        }

        // Link Performers to Scene
        for pid in &s.performer_ids {
            if performer_id_set.contains_key(pid) {
                links.push(json!({
                    "source": format!("performer-{}", pid),
                    "target": scene_node_id,
                    "type": "performer_scene",
                    "weight": 1
                }));
            }
        }
    }

    // Assemble Direct Collaboration Links (Performer <-> Performer, Performer <-> Studio)
    let mut collab_links: Vec<JValue> = Vec::new();

    for ((p1, p2), weight) in co_star_weights {
        collab_links.push(json!({
            "source": format!("performer-{}", p1),
            "target": format!("performer-{}", p2),
            "type": "co_star",
            "weight": weight
        }));
    }

    for ((pid, st_id), weight) in performer_studio_weights {
        collab_links.push(json!({
            "source": format!("performer-{}", pid),
            "target": format!("studio-{}", st_id),
            "type": "performer_studio",
            "weight": weight
        }));
    }

    let stats = json!({
        "studio_count": studio_map.len(),
        "performer_count": performers_list.len(),
        "scene_count": scenes_list.len(),
        "full_links_count": links.len(),
        "collab_links_count": collab_links.len()
    });

    Json(json!({
        "nodes": nodes,
        "links": links,
        "collab_links": collab_links,
        "stats": stats
    }))
}
