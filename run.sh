#!/bin/bash -e

export COLAB_GPU="$([[ -c /dev/nvidiactl ]] && echo 1)"

if [[ -e /customize_for_vm_type.sh ]]; then
  /customize_for_vm_type.sh
fi

/usr/local/colab/bin/oom_monitor.sh &

# Start the Colab proxy to the Jupyter kernel manager.
# TODO(b/267667580): Evaluate use of tcmalloc here and possibly other places.
( while true; do
  GCE_METADATA_HOST="${VM_GCE_METADATA_HOST}" \
  LD_PRELOAD='/usr/lib/x86_64-linux-gnu/libtcmalloc.so.4' \
  /usr/colab/bin/kernel_manager_proxy \
    --listen_port="${KMP_LISTEN_PORT}" \
    --target_port="${KMP_TARGET_PORT}" \
    ${KMP_EXTRA_ARGS} || true
  sleep 1
done & )

# Start fresh to isolate user-initiated actions from VM build & startup events.
for f in /var/log/apt/history.log /var/log/pip.log; do
  mv "$f" "${f}.bak-run.sh" 2>/dev/null || true  # Ignore missing files.
done

# Warm disk buffers for modules we need for kernel startup. (cf: b/116536906)
if [[ "${COLAB_WARMUP_DEFAULTS}" == "1" ]]; then
  python3 -c "import google.colab._kernel"
  python3 -c "import matplotlib"
  # importing tensorflow on a TPU VM causes the process to acquire the TPU for
  # the duration of the import. This makes the TPU effectively unacquirable for
  # the duration of the warmup, which can break things like probers.
  if [[ "${COLAB_TPU_1VM}" == "1" ]]; then
    python3 -c "import tensorflow"
  else
    python3 -c "import tensorflow" &
  fi
fi

# Start the server to handle /files and /api/contents requests.
/usr/local/bin/colab-fileshim.py ${COLAB_FILESHIM_EXTRA_ARGS} &

# Link NVidia tools from a read-only volume mount.
for f in $(ls /opt/bin/.nvidia 2>/dev/null); do
  ln -st /opt/bin "/opt/bin/.nvidia/${f}"
  ln -st /usr/bin "/opt/bin/.nvidia/${f}"
done

cd /

# Start the node server.
if [[ "${COLAB_HUMAN_READABLE_NODE_LOGS}" == "1" ]]; then
  PIPE=/tmp/.node.out
  if ! [[ -p "${PIPE}" ]]; then
    mkfifo "${PIPE}"
  fi
  /datalab/web/node_modules/bunyan/bin/bunyan \
    -l "${COLAB_NODE_LOG_LEVEL:-info}" < "${PIPE}" &
  exec >& "${PIPE}"
fi
exec /tools/node/bin/node /datalab/web/app.js

