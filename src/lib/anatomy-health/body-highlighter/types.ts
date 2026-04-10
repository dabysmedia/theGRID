/**
 * Mirrors react-native-body-highlighter's BodyPart shape (MIT).
 * https://github.com/HichamELBSI/react-native-body-highlighter
 */
export interface BodyPart {
  color?: string
  slug?: string
  path?: {
    common?: string[]
    left?: string[]
    right?: string[]
  }
}
