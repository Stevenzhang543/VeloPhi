/** 项目格式版本约定：声明当前引擎与格式版本，并判断输入项目兼容性。 */
/** Machine-safe semantic version used by Cargo, npm, Tauri and compatibility checks. */
export const NOVA_ENGINE_VERSION = '26.47.0'
/** Calendar release name shown to creators and used for release artifact names. */
export const NOVA_RELEASE_NAME = '26.47'
export const NOVA_PROJECT_FORMAT = 'Nova_A Project Format 2'
export const NOVA_PROJECT_FORMAT_MAJOR = 2
export const NOVA_PROJECT_SCHEMA_VERSION = 29
export const NOVA_MINIMUM_SCHEMA_VERSION = 5

export interface ProjectCompatibility {
  format: typeof NOVA_PROJECT_FORMAT
  major: typeof NOVA_PROJECT_FORMAT_MAJOR
  schemaVersion: number
  minimumSchemaVersion: number
}

/** 返回当前项目格式名称、主版本、模式版本及最低接受版本的兼容描述。 */ export function projectCompatibility(): ProjectCompatibility {
  return {
    format: NOVA_PROJECT_FORMAT,
    major: NOVA_PROJECT_FORMAT_MAJOR,
    schemaVersion: NOVA_PROJECT_SCHEMA_VERSION,
    minimumSchemaVersion: NOVA_MINIMUM_SCHEMA_VERSION
  }
}
