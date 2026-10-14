LSR_DIR    = libsamplerate
LSR_BUILD  = $(LSR_DIR)/build-wasm
LSR_LIB    = $(LSR_BUILD)/src/libsamplerate.a
OUT_DIR    = out
WRAPPER    = src/resampler.c

NPROC := $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

EXPORTED_FUNCTIONS = \
	'_resampler_new', \
	'_resampler_delete', \
	'_resampler_reset', \
	'_resampler_process', \
	'_resampler_strerror', \
	'_resampler_is_valid_ratio', \
	'_malloc', \
	'_free'

EMCC_FLAGS = \
	-O3 \
	-flto \
	-s MODULARIZE=1 \
	-s EXPORT_ES6=1 \
	-s EXPORT_NAME='createLibSampleRateModule' \
	-s EXPORTED_FUNCTIONS="[$(EXPORTED_FUNCTIONS)]" \
	-s EXPORTED_RUNTIME_METHODS="['UTF8ToString','HEAP8','HEAP32','HEAPU8','HEAPF32']" \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s INITIAL_MEMORY=4194304 \
	-s STACK_SIZE=1048576 \
	-s ENVIRONMENT='web,worker,node' \
	-s FILESYSTEM=0 \
	-s SINGLE_FILE=0 \
	-I$(LSR_DIR)/include

.PHONY: all clean lib

all: $(OUT_DIR)/libsamplerate.js

$(LSR_LIB):
	emcmake cmake -S $(LSR_DIR) -B $(LSR_BUILD) \
		-DCMAKE_BUILD_TYPE=Release \
		-DBUILD_TESTING=OFF \
		-DLIBSAMPLERATE_EXAMPLES=OFF \
		-DLIBSAMPLERATE_INSTALL=OFF \
		-DLIBSAMPLERATE_ENABLE_SINC_BEST_CONVERTER=OFF \
		-DLIBSAMPLERATE_ENABLE_SINC_MEDIUM_CONVERTER=OFF
	emmake cmake --build $(LSR_BUILD) --target samplerate -j$(NPROC)

lib: $(LSR_LIB)

$(OUT_DIR)/libsamplerate.js: $(LSR_LIB) $(WRAPPER)
	mkdir -p $(OUT_DIR)
	emcc $(WRAPPER) $(LSR_LIB) \
		$(EMCC_FLAGS) \
		-o $(OUT_DIR)/libsamplerate.js

clean:
	rm -rf $(OUT_DIR) $(LSR_BUILD)
