#include "moonbit.h"
#include <assert.h>
#include <stdint.h>

extern int32_t skill_add(int32_t a, int32_t b);

int main(void) {
  moonbit_init();
  assert(skill_add(40, 2) == 44);
  return 0;
}
