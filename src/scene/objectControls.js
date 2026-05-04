import * as THREE from 'three';

// Drag-to-rotate-the-object controls.
// Camera, lights, and world stay completely fixed; only the OBJECT rotates.
// Mouse drag horizontally → yaw around world Y. Vertical → pitch around world X.
// Both axes are world-space (not local) so dragging always feels predictable
// regardless of the current orientation — classic trackball behaviour.
export function createObjectControls(domElement, { onChange, onDragStart, onDragEnd, sensitivity = 0.008 } = {}) {
  const quaternion = new THREE.Quaternion();
  const _mat4 = new THREE.Matrix4();
  const _mat3 = new THREE.Matrix3();
  const _yaw = new THREE.Quaternion();
  const _pitch = new THREE.Quaternion();
  const _yAxis = new THREE.Vector3(0, 1, 0);
  const _xAxis = new THREE.Vector3(1, 0, 0);

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let activePointerId = null;

  function onPointerDown(e) {
    // Only respond to primary button (left click / single touch).
    if (e.button !== undefined && e.button !== 0) return;
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    activePointerId = e.pointerId;
    domElement.setPointerCapture?.(e.pointerId);
    domElement.style.cursor = 'grabbing';
    onDragStart?.();
  }

  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== activePointerId) return;
    const dx = (e.clientX - lastX) * sensitivity;
    const dy = (e.clientY - lastY) * sensitivity;
    lastX = e.clientX;
    lastY = e.clientY;

    // World-space yaw + pitch. Pre-multiply so the deltas are applied in
    // world space (left-multiply onto the existing orientation).
    _yaw.setFromAxisAngle(_yAxis, dx);
    _pitch.setFromAxisAngle(_xAxis, dy);
    quaternion.premultiply(_yaw).premultiply(_pitch);
    quaternion.normalize();

    onChange?.(quaternion);
  }

  function endDrag(e) {
    if (e && e.pointerId !== activePointerId) return;
    if (!isDragging) return;
    isDragging = false;
    activePointerId = null;
    if (e?.pointerId != null) domElement.releasePointerCapture?.(e.pointerId);
    domElement.style.cursor = 'grab';
    onDragEnd?.();
  }

  domElement.style.touchAction = 'none';
  domElement.style.cursor = 'grab';
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', endDrag);
  domElement.addEventListener('pointercancel', endDrag);
  domElement.addEventListener('pointerleave', endDrag);

  // Returns a fresh Matrix3 representing the current rotation.
  function getMatrix3() {
    _mat4.makeRotationFromQuaternion(quaternion);
    _mat3.setFromMatrix4(_mat4);
    return _mat3;
  }

  // Returns a fresh Matrix3 representing the INVERSE rotation.
  // For an SDF in world space, the lookup must be inverse-rotated:
  //   pObject = R_inv * pWorld   →   DE(pObject)
  // This makes the world-space hit point appear to belong to a rotated object.
  function getInverseMatrix3() {
    _mat4.makeRotationFromQuaternion(quaternion).invert();
    _mat3.setFromMatrix4(_mat4);
    return _mat3;
  }

  function reset() {
    quaternion.identity();
    onChange?.(quaternion);
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', endDrag);
    domElement.removeEventListener('pointercancel', endDrag);
    domElement.removeEventListener('pointerleave', endDrag);
    domElement.style.cursor = '';
  }

  return { quaternion, getMatrix3, getInverseMatrix3, reset, dispose };
}
