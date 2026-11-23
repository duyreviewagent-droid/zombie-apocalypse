// HUMAN — puts real motion-capture onto the human model.
// The clips come from a different skeleton (same bone names, different rest pose), so every frame is
// re-expressed as "how far each bone turned away from its rest pose, in world space" and applied to the
// human's own rest pose. The results are baked into ordinary clips once at load time.
import * as THREE from 'three';

// Bone names are made canonical (Mixamo style) so clips from Mixamo- and Unreal-style skeletons share one map.
const UE = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head' };
const UE_SIDE = { clavicle: 'Shoulder', upperarm: 'Arm', lowerarm: 'ForeArm', hand: 'Hand', thigh: 'UpLeg', calf: 'Leg', foot: 'Foot', ball: 'ToeBase' };
const strip = n => {
  n = n.replace(/^mixamorig:?/, '');
  if (UE[n]) return UE[n];
  let m = n.match(/^([a-z]+)_([lr])$/);
  if (m && UE_SIDE[m[1]]) return (m[2] === 'l' ? 'Left' : 'Right') + UE_SIDE[m[1]];
  m = n.match(/^(thumb|index|middle|ring|pinky)_0(\d)_([lr])$/);
  if (m) return (m[3] === 'l' ? 'Left' : 'Right') + 'Hand' + m[1][0].toUpperCase() + m[1].slice(1) + m[2];
  return n;
};
export function boneMap(root) {
  const m = {};
  root.traverse(o => { if (o.isBone) m[strip(o.name)] = o; });
  return m;
}
const depth = b => { let d = 0; while (b.parent) { d++; b = b.parent; } return d; };

// The source rig is shared by many retargets and is left posed by each one, so remember its original
// pose the first time and restore it before every retarget (otherwise later characters drift by metres).
const restPose = new WeakMap();
function resetPose(root) {
  if (!restPose.has(root)) { const m = []; root.traverse(o => m.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()])); restPose.set(root, m); }
  for (const [o, p, q, sc] of restPose.get(root)) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); }
  root.updateMatrixWorld(true);
}

export function retarget(srcRoot, clips, tgtRoot) {
  resetPose(srcRoot);
  const S = boneMap(srcRoot), T = boneMap(tgtRoot);
  const names = Object.keys(T).filter(n => S[n]).sort((a, b) => depth(T[a]) - depth(T[b]));
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  // The human stands in an A-pose, the motion skeleton in a T-pose. Swing each target bone so it points
  // the same way as the source bone before measuring rest poses, otherwise arms end up 50° off.
  const saved = names.map(n => T[n].quaternion.clone());
  const childOf = n => {
    if (n === 'Hips') return null;
    if (/Hand$/.test(n) && T[n + 'Middle1']) return n + 'Middle1';
    if (n === 'Spine2') return 'Neck';
    if (n === 'Head') return null;          // keep the face pointing where the modeller pointed it
    const kids = T[n].children.filter(c => c.isBone && S[strip(c.name)]);
    return kids.length === 1 ? strip(kids[0].name) : null;
  };
  {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    const qa = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion();
    const orig = {}; for (const n of names) orig[n] = T[n].getWorldQuaternion(new THREE.Quaternion());
    for (const n of names) {
      const ch = childOf(n);
      if (!ch) {   // no direction to match: undo whatever swing it inherited from its parent
        tgtRoot.updateMatrixWorld(true);
        T[n].parent.getWorldQuaternion(pq).invert();
        T[n].quaternion.copy(pq.multiply(orig[n]));
        continue;
      }
      tgtRoot.updateMatrixWorld(true);
      T[ch].getWorldPosition(b).sub(T[n].getWorldPosition(a)).normalize();
      S[ch].getWorldPosition(d).sub(S[n].getWorldPosition(c)).normalize();
      if (b.lengthSq() < 0.5 || d.lengthSq() < 0.5) continue;
      qa.setFromUnitVectors(b, d);
      T[n].getWorldQuaternion(wq).premultiply(qa);
      T[n].parent.getWorldQuaternion(pq).invert();
      T[n].quaternion.copy(pq.multiply(wq));
    }
    tgtRoot.updateMatrixWorld(true);
  }
  const restS = {}, restT = {}, staticParent = {};
  for (const n of names) {
    restS[n] = S[n].getWorldQuaternion(new THREE.Quaternion()).invert();
    restT[n] = T[n].getWorldQuaternion(new THREE.Quaternion());
    staticParent[n] = T[n].parent.getWorldQuaternion(new THREE.Quaternion());
  }
  const parentName = n => { const p = T[n].parent; const k = p && p.isBone ? strip(p.name) : null; return k && T[k] && S[k] ? k : null; };
  const srcHipY = S.Hips.getWorldPosition(new THREE.Vector3()).y;
  const tgtHipY = T.Hips.getWorldPosition(new THREE.Vector3()).y;
  const k = tgtHipY / srcHipY;
  const hipParentInv = T.Hips.parent.matrixWorld.clone().invert();

  names.forEach((n, i) => T[n].quaternion.copy(saved[i]));
  tgtRoot.updateMatrixWorld(true);
  const out = {};
  const mixer = new THREE.AnimationMixer(srcRoot);
  const q = new THREE.Quaternion(), w = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const clip of clips) {
    const act = mixer.clipAction(clip); act.play();
    const N = Math.max(2, Math.round(clip.duration * 30) + 1);
    const times = new Float32Array(N), qv = {}, hp = new Float32Array(N * 3);
    for (const n of names) qv[n] = new Float32Array(N * 4);
    const W = {};
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1) * clip.duration;
      times[i] = t;
      mixer.setTime(Math.min(t, clip.duration - 1e-4));
      srcRoot.updateMatrixWorld(true);
      for (const n of names) {
        S[n].getWorldQuaternion(q);
        q.multiply(restS[n]);                       // world-space turn away from rest
        const wq = (W[n] ||= new THREE.Quaternion()).copy(q).multiply(restT[n]);
        const pn = parentName(n);
        w.copy(pn ? W[pn] : staticParent[n]).invert().multiply(wq);
        const a = qv[n], o = i * 4;
        if (i > 0 && a[o - 4] * w.x + a[o - 3] * w.y + a[o - 2] * w.z + a[o - 1] * w.w < 0) w.set(-w.x, -w.y, -w.z, -w.w);
        a[o] = w.x; a[o + 1] = w.y; a[o + 2] = w.z; a[o + 3] = w.w;
      }
      S.Hips.getWorldPosition(v).multiplyScalar(k).applyMatrix4(hipParentInv);
      hp[i * 3] = v.x; hp[i * 3 + 1] = v.y; hp[i * 3 + 2] = v.z;
    }
    act.stop(); mixer.uncacheAction(clip);
    const tracks = names.map(n => new THREE.QuaternionKeyframeTrack(`${T[n].name}.quaternion`, times, qv[n]));
    tracks.push(new THREE.VectorKeyframeTrack(`${T.Hips.name}.position`, times, hp));
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  return out;
}

// Studies a locomotion clip on the human: how fast the planted foot travels backwards (= how fast the body
// should move so feet don't slide), when the left heel lands, and how far the feet sit off the floor.
export function analyse(root, clip, restFootY) {
  const T = boneMap(root);
  const mixer = new THREE.AnimationMixer(root);
  const act = mixer.clipAction(clip); act.play();
  const N = 120, dt = clip.duration / N;
  const L = [], R = [], v = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    mixer.setTime(Math.min(i * dt, clip.duration - 1e-4));
    root.updateMatrixWorld(true);
    T.LeftFoot.getWorldPosition(v); L.push(v.clone());
    T.RightFoot.getWorldPosition(v); R.push(v.clone());
  }
  act.stop(); mixer.uncacheRoot(root);
  const low = L.map((l, i) => Math.min(l.y, R[i].y)).sort((a, b) => a - b);
  const floorErr = low[Math.floor(low.length * 0.1)] - restFootY;
  const speeds = [];
  for (let i = 0; i < N; i++) {
    for (const F of [L, R]) {
      const other = F === L ? R : L;
      if (F[i].y <= other[i].y && F[i].y - restFootY - floorErr < 0.035) {
        speeds.push(Math.hypot(F[i + 1].x - F[i].x, F[i + 1].z - F[i].z) / dt);
      }
    }
  }
  speeds.sort((a, b) => a - b);
  const speed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
  let strike = 0, best = -1e9;
  for (let i = 0; i < N; i++) if (L[i].z > best) { best = L[i].z; strike = i * dt; }
  return { speed, strike, floorErr, duration: clip.duration };
}
